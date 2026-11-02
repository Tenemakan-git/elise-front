import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { RiskLevel } from './message.entity';
import { SafetyService } from './safety.service';
import { RagService } from '../rag/rag.service';

export interface SourceRef {
  title: string;
  source: string;
  url: string;
}

export interface Classified {
  level: RiskLevel;
  label: string;
  reason: string;
  via: 'claude' | 'local';
}

export type StreamEvent =
  | { type: 'meta'; level: RiskLevel; via: 'claude' | 'local' }
  | { type: 'chunk'; html: string }
  | { type: 'done'; level: RiskLevel; source?: SourceRef | null }
  | { type: 'error'; message: string };

/** Un echange passe de la session, transmis au modele pour garder le contexte. */
export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const LABELS: Record<RiskLevel, string> = {
  green: 'Information',
  yellow: 'Surveillance',
  orange: 'Consultation',
  red: 'Urgence',
};

/** Score BM25 minimal pour juger un passage reellement pertinent. */
const RAG_MIN_SCORE = 3.0;

const SYSTEM = `Tu es Elise, assistante confidentielle de sante feminine pour jeunes Ivoiriennes (15-25 ans). Tu reponds en francais simple, bienveillant, sans jugement, en tutoyant toujours.

PERIMETRE : cycle, contraception, IST, grossesse, sante mentale, violences. Hors de ce perimetre, tu l'indiques et tu reorientes.

SOURCES : on te fournit parfois des EXTRAITS VERIFIES. Quand ils sont presents, appuie ta reponse UNIQUEMENT sur eux et n'invente rien. Si les extraits ne permettent pas de repondre, dis simplement que tu n'as pas l'information fiable et oriente vers un professionnel de sante a Abidjan. N'invente jamais de chiffre, de delai ou de nom.

REGLES DE SECURITE (absolues) :
- Tu ne poses JAMAIS de diagnostic. Tu ne nommes JAMAIS une maladie probable a partir de symptomes.
- Tu ne prescris JAMAIS et tu ne nommes JAMAIS de medicament ni de posologie.
- Tu n'inventes pas de symptomes a lister "pour conseiller". Si besoin, tu aides a PREPARER une consultation.
- Tu ne presumes pas l'age de la personne.
- Tu ne salues qu'au tout premier message. Si l'historique contient deja un echange, tu ne dis NI "Bonjour" NI "Bienvenue".

REGLES DE FORMAT (obligatoires) :
- INTERDIT d'utiliser les caracteres * et # dans ta reponse. Jamais de markdown.
- Pour mettre en valeur : uniquement <b>mot important</b>.
- Paragraphes courts separes par <br><br>. Listes avec <ul><li>...</li></ul>.
- Aucun emoji. Ton chaleureux mais sobre. Maximum 160 mots.`;

/** Nettoie le markdown residuel et normalise en HTML sur pour le frontend. */
function formatHtml(input: string): string {
  let s = (input || '').trim();
  s = s.replace(/```html/gi, '').replace(/```/g, '');
  s = s.replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  s = s.replace(/(?:^|\n)((?:\s*[-*•]\s+.+(?:\n|$))+)/g, (block) => {
    const items = block
      .split('\n')
      .map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
      .filter(Boolean)
      .map((l) => `<li>${l}</li>`)
      .join('');
    return `\n<ul>${items}</ul>`;
  });
  s = s.replace(/(?:^|\n)((?:\s*\d+[.)]\s+.+(?:\n|$))+)/g, (block) => {
    const items = block
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.)]\s+/, '').trim())
      .filter(Boolean)
      .map((l) => `<li>${l}</li>`)
      .join('');
    return `\n<ol>${items}</ol>`;
  });
  const allowed = ['b', 'br', 'ul', 'ol', 'li', 'p'];
  s = s.replace(/<\/?([a-zA-Z0-9]+)(\s[^<>]*)?>/g, (tag, name) => {
    if (allowed.includes(String(name).toLowerCase())) return tag;
    return '';
  });
  s = s.replace(/\n{3,}/g, '\n\n').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  s = s.replace(/(<br>\s*){3,}/g, '<br><br>');
  s = s.replace(/\*/g, '').replace(/^#+\s*/gm, '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2764}\u{2022}\u{25CF}\u{25B6}\u{2716}\u{2714}]/gu, '');
  return s.trim();
}

@Injectable()
export class ClaudeService {
  private client: Anthropic | null = null;
  private modelName: string;

  constructor(private safety: SafetyService, private rag: RagService) {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    this.modelName = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }
  get enabled() { return !!this.client; }
  get model() { return this.modelName; }

  /** Recupere les passages pertinents et prepare le contexte + la source a afficher. */
  private ragContext(question: string): { context: string; source: SourceRef | null } {
    const hits = this.rag.retrieve(question, 3).filter((h) => h.score >= RAG_MIN_SCORE);
    if (hits.length === 0) return { context: '', source: null };
    const context = hits
      .map((h, i) => `[Extrait ${i + 1} — ${h.passage.title} (${h.passage.source})]\n${h.passage.text}`)
      .join('\n\n');
    const top = hits[0].passage;
    return { context, source: { title: top.title, source: top.source, url: top.url } };
  }

  /**
   * Streaming : meta immediat -> chunk* -> done (avec source RAG eventuelle).
   */
  async *streamAnswer(question: string, history: Turn[] = []): AsyncGenerator<StreamEvent> {
    const verdict = this.safety.classifyByList(question);

    // Niveau rouge : message preecrit, affiche immediatement, sans LLM ni RAG.
    if (verdict.listLevel === 'red') {
      yield { type: 'meta', level: 'red', via: 'local' };
      yield* this.animatedReplay(this.safety.emergencyHtml(question), 'red', null);
      return;
    }

    // Contournement : refus poli, journalise, oriente.
    if (verdict.bypass) {
      const level = this.safety.combine(verdict.listLevel, 'orange');
      yield { type: 'meta', level, via: 'local' };
      yield* this.animatedReplay(this.safety.bypassReplyHtml(), level, null);
      return;
    }

    yield { type: 'meta', level: verdict.listLevel, via: this.client ? 'claude' : 'local' };

    // Mode local (sans cle) : on sert directement le meilleur extrait verifie.
    if (!this.client) {
      const grounded = this.localGrounded(question);
      if (grounded) {
        yield* this.animatedReplay(grounded.html, verdict.listLevel, grounded.source);
      } else {
        yield* this.animatedReplay(this.localAnswer(question, verdict.listLevel, history), verdict.listLevel, null);
      }
      return;
    }

    try {
      const { level, html, source } = await this.generate(question, history, verdict.listLevel);
      yield* this.animatedReplay(html, level, source);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Claude] ERREUR stream:', (e as Error).message?.slice(0, 150));
      const grounded = this.localGrounded(question);
      if (grounded) yield* this.animatedReplay(grounded.html, verdict.listLevel, grounded.source);
      else yield* this.animatedReplay(this.localAnswer(question, verdict.listLevel, history), verdict.listLevel, null);
    }
  }

  /** Version non-streaming (POST /chat), meme logique. */
  async classifyAndAnswer(question: string, history: Turn[] = []) {
    const verdict = this.safety.classifyByList(question);

    if (verdict.listLevel === 'red') {
      return {
        answer: this.safety.emergencyHtml(question), source: null as SourceRef | null,
        classification: { level: 'red' as RiskLevel, label: LABELS.red, reason: 'Urgence detectee', via: 'local' as const },
      };
    }
    if (verdict.bypass) {
      const level = this.safety.combine(verdict.listLevel, 'orange');
      return {
        answer: this.safety.bypassReplyHtml(), source: null as SourceRef | null,
        classification: { level, label: LABELS[level], reason: 'Tentative de contournement', via: 'local' as const },
      };
    }

    if (!this.client) {
      const grounded = this.localGrounded(question);
      return {
        answer: grounded ? grounded.html : this.localAnswer(question, verdict.listLevel, history),
        source: grounded ? grounded.source : null,
        classification: { level: verdict.listLevel, label: LABELS[verdict.listLevel], reason: grounded ? 'Extrait verifie' : 'Classification locale', via: 'local' as const },
      };
    }

    try {
      const { level, html, reason, source } = await this.generate(question, history, verdict.listLevel);
      return {
        answer: html, source,
        classification: { level, label: LABELS[level], reason, via: 'claude' as const },
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Claude] ERREUR:', (e as Error).message?.slice(0, 200));
      const grounded = this.localGrounded(question);
      return {
        answer: grounded ? grounded.html : this.localAnswer(question, verdict.listLevel, history),
        source: grounded ? grounded.source : null,
        classification: { level: verdict.listLevel, label: LABELS[verdict.listLevel], reason: 'Repli local', via: 'local' as const },
      };
    }
  }

  /**
   * Appelle le modele avec l'historique ET les extraits verifies (RAG), puis :
   *   - niveau final = max(plancher liste, niveau LLM) ;
   *   - filtre de sortie (pas de diagnostic ni de medicament).
   */
  private async generate(
    question: string,
    history: Turn[],
    listLevel: RiskLevel,
  ): Promise<{ level: RiskLevel; html: string; reason: string; source: SourceRef | null }> {
    const { context, source } = this.ragContext(question);
    const raw = await this.callClaude(question, history, context);

    const m = raw.match(/NIVEAU:\s*(GREEN|YELLOW|ORANGE|RED)/i);
    const llmLevel = (m ? m[1].toLowerCase() : null) as RiskLevel | null;
    let level = this.safety.combine(listLevel, llmLevel);
    const reason = ((raw.split(/RAISON:/i)[1] || '').split('\n')[0] || 'Analyse Elise').trim();

    if (level === 'red') {
      return { level, html: this.safety.emergencyHtml(question), reason, source: null };
    }

    let html = formatHtml((raw.split(/REPONSE:/i)[1] || raw).trim());

    const filtered = this.safety.filterOutput(html);
    if (filtered.blocked) {
      html = filtered.html;
      level = this.safety.combine(level, 'orange');
      // Reponse corrigee par le filtre : la source n'est plus garantie pertinente.
      return { level, html, reason, source: null };
    }

    // Source affichee seulement si des extraits ont reellement ete fournis.
    return { level, html, reason, source: context ? source : null };
  }

  private async callClaude(question: string, history: Turn[], context: string): Promise<string> {
    if (!this.client) throw new Error('Claude not configured');

    const MAX_TURNS = 10;
    const recent = history.slice(-MAX_TURNS);
    const messages: Anthropic.MessageParam[] = recent.map((t) => ({ role: t.role, content: t.content }));

    const sourceBlock = context
      ? `EXTRAITS VERIFIES (appuie-toi uniquement sur eux) :\n${context}\n\n`
      : `Aucun extrait verifie disponible pour cette question. Si tu n'es pas sure, dis-le et oriente vers un professionnel de sante a Abidjan.\n\n`;

    messages.push({
      role: 'user',
      content:
        `${sourceBlock}` +
        `Message de l'utilisatrice : """${question}"""\n` +
        `Reponds EXACTEMENT au format :\n` +
        `NIVEAU: GREEN|YELLOW|ORANGE|RED\n` +
        `RAISON: une phrase courte\n` +
        `REPONSE: reponse HTML (sans *, sans #, avec <b>, <br><br>, <ul><li> si liste, max 160 mots). ` +
        `Jamais de diagnostic ni de medicament. Ne salue pas si la conversation a deja commence.`,
    });

    const res = await this.client.messages.create({
      model: this.modelName,
      max_tokens: 600,
      system: SYSTEM,
      messages,
    });
    const blocks: any[] = (res as any).content || [];
    return blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  /**
   * Mode local / repli : construit une reponse a partir du meilleur extrait
   * verifie, sans modele. Rend la reponse + la source, ou null si rien de fiable.
   */
  private localGrounded(question: string): { html: string; source: SourceRef } | null {
    const hits = this.rag.retrieve(question, 1).filter((h) => h.score >= RAG_MIN_SCORE);
    if (hits.length === 0) return null;
    const p = hits[0].passage;
    // On sert le texte de l'extrait, mis en forme, sans rien inventer.
    const html = formatHtml(p.text);
    return { html, source: { title: p.title, source: p.source, url: p.url } };
  }

  /** Replay anime d'un texte : effet machine a ecrire. Source portee par le 'done'. */
  private async *animatedReplay(answerHtml: string, level: RiskLevel, source: SourceRef | null): AsyncGenerator<StreamEvent> {
    const words = answerHtml.split(' ');
    let shown = '';
    for (let i = 0; i < words.length; i++) {
      shown += (i ? ' ' : '') + words[i];
      if (i % 2 === 0 || i === words.length - 1) {
        yield { type: 'chunk', html: formatHtml(shown) };
        await new Promise((r) => setTimeout(r, 18));
      }
    }
    yield { type: 'done', level, source };
  }

  /**
   * Reponses locales generiques (quand le RAG ne trouve rien d'assez pertinent).
   * Respectent les memes regles : jamais de diagnostic ni de medicament nomme.
   */
  private localAnswer(q: string, level: RiskLevel, history: Turn[]): string {
    const t = q.toLowerCase();
    const first = history.length === 0;
    if (level === 'orange')
      return `Ce que tu decris merite l'avis d'un professionnel. <b>Consulte un centre de sante ou un planning familial a Abidjan</b> cette semaine (AIBEF, par exemple). Je peux t'aider a <b>preparer ta consultation</b>.`;
    if (first && (t.includes('bonjour') || t.includes('salut')))
      return `Bonjour, et bienvenue. Tu peux me parler <b>cycle, contraception, IST, grossesse ou emotions</b>, sans tabou. Qu'est-ce qui t'amene aujourd'hui ?`;
    return `Merci de ta confiance. Pour mieux t'orienter, dis-moi depuis quand cela dure et ce que tu ressens. En cas d'urgence : <b>185 / 1308 / 139</b>.`;
  }
}
