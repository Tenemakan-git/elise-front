import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { RiskLevel } from './message.entity';

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

const LABELS: Record<RiskLevel, string> = {
  green: '🟢 INFORMATION',
  yellow: '🟡 SURVEILLANCE',
  orange: '🟠 CONSULTATION',
  red: '🔴 URGENCE',
};

const SYSTEM = `Tu es Elise, assistante confidentielle de sante feminine pour jeunes Ivoiriennes (15-25 ans). Reponds en francais simple, bienveillant, sans jugement. Si agression, idees suicidaires, hemorragie -> URGENCE (SAMU 185, VBG 1308, psy 139). Ne remplaces pas un medecin. Classe en GREEN/YELLOW/ORANGE/RED.
REGLES DE FORMAT STRICTES (obligatoires) :
- INTERDIT d'utiliser les caracteres * et # dans ta reponse. Jamais de markdown (**gras**, *italique*, ## titre, - liste).
- Pour mettre en valeur : utilise uniquement la balise HTML <b>mot important</b>.
- Paragraphes courts : separe par <br><br>.
- Listes : utilise <ul><li>point 1</li><li>point 2</li></ul> ou <ol><li>etape 1</li><li>etape 2</li></ol>.
- Interdiction absolue d'utiliser des emojis (aucun caractère type 🌸, 😊, ❤️, 🟢, points unicode décoratifs).
- Ton professionnel, chaleureux mais sobre : phrases claires, pas d'emphase.`;

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
  // filet de securite : supprime les emojis / symboles unicode decoratifs
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2764}\u{2022}\u{25CF}\u{25B6}\u{2716}\u{2714}]/gu, '');
  return s.trim();
}


function localClassify(text: string): Classified {
  const t = text.toLowerCase();
  const red = ['forc','viol','agress','suicid','mourir','me tuer','frap','menac','couteau','saigne beaucoup','hemorragie','evanoui','battue','kidnapp'];
  const orange = ['retard','enceinte','test de grossesse','ist','ecoulement','brulure','bouton','demangeaison','pilule du lendemain','fievre','pertes','rapport non protege'];
  const yellow = ['douleur','triste','seule','angoiss','stress','fatigu','irregulier','deprime','peur','pleure','insomnie','anxieuse'];

  let level: RiskLevel = 'green';
  if (red.some((k) => t.includes(k))) level = 'red';
  else if (orange.some((k) => t.includes(k))) level = 'orange';
  else if (yellow.some((k) => t.includes(k))) level = 'yellow';
  return { level, label: LABELS[level], reason: 'Classification locale', via: 'local' };
}
@Injectable()
export class ClaudeService {
  private client: Anthropic | null = null;
  private modelName: string;
  constructor() {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    this.modelName = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }
  get enabled() { return !!this.client; }
  get model() { return this.modelName; }

  /**
   * Streaming type ChatGPT :
   * 1) evenement "meta" immediat (classement via Safety Engine local, ultra-rapide)
   * 2) evenements "chunk" au fil de l'eau depuis Claude
   * 3) evenement "done" en fin de flux
   * En cas d'echec Claude : replay local anime (meme effet visuel).
   */
  async *streamAnswer(question: string): AsyncGenerator<StreamEvent> {
    // 1) Classification instantanee pour afficher le badge tout de suite
    const classification = localClassify(question);
    yield { type: 'meta', level: classification.level, via: this.client ? 'claude' : 'local' };

    if (!this.client) {
      yield* this.localStream(question, classification.level);
      return;
    }
    try {
      const prompt = `Message: """${question}""" Reponds format: NIVEAU: GREEN|YELLOW|ORANGE|RED / RAISON: phrase / REPONSE: reponse HTML (sans *, sans #, avec <b>, <br><br>, <ul><li> si liste, max 180 mots, Abidjan + 185/1308/139 si grave).`;
      const raw = await this.callClaude(prompt);
      yield* this.animatedReplay(this.extractResponse(raw), classification.level);
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Claude] ERREUR stream:', (e as Error).message?.slice(0, 150));
      yield* this.localStream(question, classification.level);
    }
  }

  /** Replay anime d'un texte Claude : effet machine a ecrire. */
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

  /** Replay local anime : decoupe la reponse en mots pour un effet machine a ecrire. */
  private async *localStream(q: string, level: RiskLevel): AsyncGenerator<StreamEvent> {
    const answer = this.localAnswer(q, level);
    yield* this.animatedReplay(answer, level);
  }

  private async callClaude(prompt: string): Promise<string> {
    if (!this.client) throw new Error('Claude not configured');
    const res = await this.client.messages.create({
      model: this.modelName,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const blocks: any[] = (res as any).content || [];
    return blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  private extractResponse(raw: string): string {
    const parts = raw.split(/REPONSE:/i);
    return (parts[1] || raw).trim();
  }

  async classifyAndAnswer(question: string) {
    const fallback = localClassify(question);
    if (!this.client) return { answer: this.localAnswer(question, fallback.level), classification: fallback };
    try {
      // eslint-disable-next-line no-console
      console.log('[Claude] appel pour:', question.slice(0, 60));
      const prompt = `Message: """${question}""" Reponds format: NIVEAU: GREEN|YELLOW|ORANGE|RED / RAISON: phrase / REPONSE: reponse HTML (sans *, sans #, avec <b>, <br><br>, <ul><li> si liste, max 180 mots, Abidjan + 185/1308/139 si grave).`;
      const raw = await this.callClaude(prompt);
      // eslint-disable-next-line no-console
      console.log('[Claude] reponse recue');
      const m = raw.match(/NIVEAU:\s*(GREEN|YELLOW|ORANGE|RED)/i);
      const lvl = (m ? m[1].toLowerCase() : fallback.level) as RiskLevel;
      let rep = (raw.split(/REPONSE:/i)[1] || raw).trim();
      rep = formatHtml(rep);
      const rs = ((raw.split(/RAISON:/i)[1] || '').split('\n')[0] || 'Classification Claude').trim();
      return { answer: rep, classification: { level: lvl, label: LABELS[lvl], reason: rs, via: 'claude' as const } };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Claude] ERREUR:', (e as Error).message?.slice(0, 200));
      return { answer: this.localAnswer(question, fallback.level), classification: fallback };
    }
  }
  private localAnswer(q: string, level: RiskLevel): string {
    const t = q.toLowerCase();
    if (level === 'red') return `Situation urgente : mets-toi en securite et appelle <b>SAMU 185</b> / <b>VBG 1308</b> / <b>psy 139</b>. Ce n'est pas ta faute. Raconte-moi, je t'ecoute.`;
    if (t.includes('fertile') || t.includes('cycle')) return `Cycle 21-35j. Ovulation ~<b>14j avant regles</b>. Fertilite J-3 a J. Donne date dernieres regles, je calcule.`;
    if (t.includes('contraception') || t.includes('pilule') || t.includes('preservatif')) return `Options : <b>preservatif</b> (anti-IST), <b>pilule</b>, <b>implant</b>, <b>DIU</b>. Urgence 72h. Voir <b>planning familial / AIBEF Abidjan</b>.`;
    if (t.includes('retard') || t.includes('enceinte')) return `Retard >7j -> <b>test urinaire</b> (pharmacie, matin). Si positif, voir <b>sage-femme</b> vite. Depuis quand ?`;
    if (t.includes('ist') || t.includes('ecoulement') || t.includes('depister')) return `Signes IST : ecoulements, brulures, boutons. Seul <b>test en centre</b> confirme. <b>Consulte cette semaine</b>.`;
    if (t.includes('douleur')) return `<b>Bouillotte, paracetamol, repos</b>. Consulte si bloquant ou saignements abondants. Chaque cycle ?`;
    if (t.includes('triste') || t.includes('stress') || t.includes('seule')) return `Je t'entends. Essaie : <b>parler, dormir 7-8h, marcher</b>. Si >2 semaines ou idees noires -> <b>139</b>. Depuis quand ?`;
    if (t.includes('bonjour') || t.includes('salut')) return `Bonjour et bienvenue. Parle-moi <b>cycle, contraception, emotions</b>... sans tabou.`;
    return `Merci. Precise : depuis quand, symptomes ? <b>Urgence = 185/1308/139</b>. Dis-m'en plus.`;
  }
}
