import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { RiskLevel } from './message.entity';
import { SafetyService } from './safety.service';

export interface Classified {
  level: RiskLevel;
  label: string;
  reason: string;
  via: 'claude' | 'local';
}

export type StreamEvent =
  | { type: 'meta'; level: RiskLevel; via: 'claude' | 'local' }
  | { type: 'chunk'; html: string }
  | { type: 'done'; level: RiskLevel }
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

const SYSTEM = `Tu es Elise, assistante confidentielle de sante feminine pour jeunes Ivoiriennes (15-25 ans). Tu reponds en francais simple, bienveillant, sans jugement, en tutoyant toujours.

PERIMETRE : cycle, contraception, IST, grossesse, sante mentale, violences. Hors de ce perimetre, tu l'indiques et tu reorientes.

REGLES DE SECURITE (absolues) :
- Tu ne poses JAMAIS de diagnostic. Tu ne nommes JAMAIS une maladie probable a partir de symptomes.
- Tu ne prescris JAMAIS et tu ne nommes JAMAIS de medicament ni de posologie.
- Tu ne demandes pas de lister des symptomes "pour conseiller". Si besoin, tu aides a PREPARER une consultation.
- Tu ne presumes pas l'age de la personne.
- Tu ne salues qu'au tout premier message de la conversation. Si l'historique contient deja un echange, tu ne dis NI "Bonjour" NI "Bienvenue" : tu reponds directement.

REGLES DE FORMAT (obligatoires) :
- INTERDIT d'utiliser les caracteres * et # dans ta reponse. Jamais de markdown.
- Pour mettre en valeur : uniquement <b>mot important</b>.
- Paragraphes courts separes par <br><br>. Listes avec <ul><li>...</li></ul> ou <ol><li>...</li></ol>.
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

  constructor(private safety: SafetyService) {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    this.modelName = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }
  get enabled() { return !!this.client; }
  get model() { return this.modelName; }

  /**
   * Streaming : meta immediat (plancher liste d'alerte) -> chunk* -> done.
   * @param history echanges precedents de la session, pour le contexte.
   */
  async *streamAnswer(question: string, history: Turn[] = []): AsyncGenerator<StreamEvent> {
    const verdict = this.safety.classifyByList(question);

    // Niveau rouge : message preecrit, affiche immediatement, sans passer par le LLM.
    if (verdict.listLevel === 'red') {
      yield { type: 'meta', level: 'red', via: 'local' };
      yield* this.animatedReplay(this.safety.emergencyHtml(question), 'red');
      return;
    }

    // Contournement : refus poli, journalise, oriente.
    if (verdict.bypass) {
      const level = this.safety.combine(verdict.listLevel, 'orange');
      yield { type: 'meta', level, via: 'local' };
      yield* this.animatedReplay(this.safety.bypassReplyHtml(), level);
      return;
    }

    // Badge immediat au plancher liste ; le niveau final (>= plancher) arrive au 'done'.
    yield { type: 'meta', level: verdict.listLevel, via: this.client ? 'claude' : 'local' };

    if (!this.client) {
      yield* this.animatedReplay(this.localAnswer(question, verdict.listLevel, history), verdict.listLevel);
      return;
    }

    try {
      const { level, html } = await this.generate(question, history, verdict.listLevel);
      yield* this.animatedReplay(html, level);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Claude] ERREUR stream:', (e as Error).message?.slice(0, 150));
      yield* this.animatedReplay(this.localAnswer(question, verdict.listLevel, history), verdict.listLevel);
    }
  }

  /** Version non-streaming (POST /chat), meme logique de securite. */
  async classifyAndAnswer(question: string, history: Turn[] = []) {
    const verdict = this.safety.classifyByList(question);

    if (verdict.listLevel === 'red') {
      return {
        answer: this.safety.emergencyHtml(question),
        classification: { level: 'red' as RiskLevel, label: LABELS.red, reason: 'Urgence detectee', via: 'local' as const },
      };
    }
    if (verdict.bypass) {
      const level = this.safety.combine(verdict.listLevel, 'orange');
      return {
        answer: this.safety.bypassReplyHtml(),
        classification: { level, label: LABELS[level], reason: 'Tentative de contournement', via: 'local' as const },
      };
    }

    if (!this.client) {
      return {
        answer: this.localAnswer(question, verdict.listLevel, history),
        classification: { level: verdict.listLevel, label: LABELS[verdict.listLevel], reason: 'Classification locale', via: 'local' as const },
      };
    }

    try {
      const { level, html, reason } = await this.generate(question, history, verdict.listLevel);
      return {
        answer: html,
        classification: { level, label: LABELS[level], reason, via: 'claude' as const },
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Claude] ERREUR:', (e as Error).message?.slice(0, 200));
      return {
        answer: this.localAnswer(question, verdict.listLevel, history),
        classification: { level: verdict.listLevel, label: LABELS[verdict.listLevel], reason: 'Repli local', via: 'local' as const },
      };
    }
  }

  /**
   * Appelle le modele avec l'historique, puis applique :
   *   - niveau final = max(plancher liste, niveau LLM) ;
   *   - filtre de sortie (pas de diagnostic ni de medicament).
   */
  private async generate(
    question: string,
    history: Turn[],
    listLevel: RiskLevel,
  ): Promise<{ level: RiskLevel; html: string; reason: string }> {
    const raw = await this.callClaude(question, history);

    const m = raw.match(/NIVEAU:\s*(GREEN|YELLOW|ORANGE|RED)/i);
    const llmLevel = (m ? m[1].toLowerCase() : null) as RiskLevel | null;
    let level = this.safety.combine(listLevel, llmLevel);

    const reason = ((raw.split(/RAISON:/i)[1] || '').split('\n')[0] || 'Analyse Elise').trim();

    // Si le modele a finalement estime une urgence, on sert le message preecrit.
    if (level === 'red') {
      return { level, html: this.safety.emergencyHtml(question), reason };
    }

    let html = formatHtml((raw.split(/REPONSE:/i)[1] || raw).trim());

    // Filtre de sortie : pas de diagnostic nomme ni de medicament.
    const filtered = this.safety.filterOutput(html);
    if (filtered.blocked) {
      html = filtered.html;
      // Une reponse qui tentait de diagnostiquer merite au moins le niveau consultation.
      level = this.safety.combine(level, 'orange');
    }

    return { level, html, reason };
  }

  private async callClaude(question: string, history: Turn[]): Promise<string> {
    if (!this.client) throw new Error('Claude not configured');

    // Historique transmis au modele (limite aux derniers echanges pour la latence).
    const MAX_TURNS = 10;
    const recent = history.slice(-MAX_TURNS);
    const messages: Anthropic.MessageParam[] = recent.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    // Le dernier message utilisateur, avec la consigne de format.
    messages.push({
      role: 'user',
      content:
        `Message: """${question}"""\n` +
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

  /** Replay anime d'un texte : effet machine a ecrire. */
  private async *animatedReplay(answerHtml: string, level: RiskLevel): AsyncGenerator<StreamEvent> {
    const words = answerHtml.split(' ');
    let shown = '';
    for (let i = 0; i < words.length; i++) {
      shown += (i ? ' ' : '') + words[i];
      if (i % 2 === 0 || i === words.length - 1) {
        yield { type: 'chunk', html: formatHtml(shown) };
        await new Promise((r) => setTimeout(r, 18));
      }
    }
    yield { type: 'done', level };
  }

  /**
   * Reponses locales (sans cle API). Respectent les memes regles :
   * jamais de diagnostic ni de medicament nomme, salut uniquement si 1er message.
   */
  private localAnswer(q: string, level: RiskLevel, history: Turn[]): string {
    const t = q.toLowerCase();
    const first = history.length === 0;
    if (level === 'orange')
      return `Ce que tu decris merite l'avis d'un professionnel. <b>Consulte un centre de sante ou un planning familial a Abidjan</b> cette semaine (AIBEF, par exemple). Je peux t'aider a <b>preparer ta consultation</b> : depuis quand, a quels moments, ce que tu veux demander.`;
    if (t.includes('fertile') || t.includes('cycle'))
      return `Un cycle dure en general 21 a 35 jours. L'ovulation se situe environ <b>14 jours avant les regles</b>, et la periode fertile couvre les jours qui l'entourent. Donne-moi la date de tes dernieres regles, je t'aide a reperer cette periode.`;
    if (t.includes('contraception') || t.includes('pilule') || t.includes('preservatif'))
      return `Plusieurs moyens existent : le <b>preservatif</b> (seul a proteger aussi des IST), la pilule, l'implant, le DIU. Le choix depend de toi et merite d'etre discute en <b>planning familial</b> (AIBEF Abidjan). Veux-tu que je t'explique comment s'y rendre ?`;
    if (t.includes('triste') || t.includes('stress') || t.includes('seule'))
      return `Je t'entends, et ce que tu ressens compte. Essaie de <b>parler a une personne de confiance</b>, de dormir suffisamment et de bouger un peu chaque jour. Si cela dure plus de deux semaines ou pese trop lourd, la ligne <b>139</b> est la pour t'ecouter. Depuis quand te sens-tu ainsi ?`;
    if (first && (t.includes('bonjour') || t.includes('salut')))
      return `Bonjour, et bienvenue. Tu peux me parler <b>cycle, contraception, IST, grossesse ou emotions</b>, sans tabou. Qu'est-ce qui t'amene aujourd'hui ?`;
    return `Merci de ta confiance. Pour mieux t'orienter, dis-moi depuis quand cela dure et ce que tu ressens. En cas d'urgence : <b>185 / 1308 / 139</b>.`;
  }
}
