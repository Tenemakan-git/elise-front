import { Injectable } from '@nestjs/common';
import { ClaudeService, StreamEvent, Turn } from './claude.service';

interface HistItem {
  id: string;
  question: string;
  answer: string;
  level: string;
  createdAt: Date;
}

/**
 * ChatService — orchestre la conversation.
 *
 * L'historique est conserve PAR SESSION (en memoire, non persiste), uniquement
 * le temps de la session serveur, pour :
 *   1) transmettre le contexte au modele (fin du "Bonjour" repete, suivi d'une
 *      situation qui s'aggrave) ;
 *   2) ne JAMAIS saluer apres le premier message.
 * Aucun contenu n'est ecrit sur disque ni journalise (confidentialite).
 */
@Injectable()
export class ChatService {
  private sessions = new Map<string, HistItem[]>();
  private seq = 1;

  constructor(private claude: ClaudeService) {}

  private store(sessionId?: string): HistItem[] {
    const key = sessionId || 'default';
    let s = this.sessions.get(key);
    if (!s) {
      s = [];
      this.sessions.set(key, s);
    }
    return s;
  }

  /** Reconstruit l'historique au format attendu par le modele (ordre chronologique). */
  private turns(store: HistItem[]): Turn[] {
    const chrono = [...store].reverse(); // le store est en ordre anti-chronologique
    const turns: Turn[] = [];
    for (const h of chrono) {
      turns.push({ role: 'user', content: h.question });
      turns.push({ role: 'assistant', content: h.answer });
    }
    return turns;
  }

  /** Flux SSE : meta -> chunk* -> done, avec historique de session. */
  async *stream(message: string, sessionId?: string): AsyncGenerator<string> {
    const store = this.store(sessionId);
    const history = this.turns(store);

    let finalLevel = 'green';
    let full = '';
    for await (const ev of this.claude.streamAnswer(message, history) as AsyncGenerator<StreamEvent>) {
      if (ev.type === 'done') finalLevel = ev.level;
      if (ev.type === 'chunk') full = ev.html;
      yield `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
    }

    store.unshift({
      id: String(this.seq++),
      question: message,
      answer: full,
      level: finalLevel,
      createdAt: new Date(),
    });
  }

  async send(message: string, sessionId?: string) {
    const store = this.store(sessionId);
    const history = this.turns(store);

    const { answer, classification } = await this.claude.classifyAndAnswer(message, history);
    const item: HistItem = {
      id: String(this.seq++),
      question: message,
      answer,
      level: classification.level,
      createdAt: new Date(),
    };
    store.unshift(item);
    return {
      id: item.id,
      answer,
      level: classification.level,
      label: classification.label,
      reason: classification.reason,
      via: classification.via,
      claudeEnabled: this.claude.enabled,
      createdAt: item.createdAt,
    };
  }

  history(limit = 50, sessionId?: string) {
    return this.store(sessionId).slice(0, limit);
  }

  /** Efface l'historique d'une session (bouton "Tout effacer" cote front). */
  clear(sessionId?: string) {
    this.sessions.delete(sessionId || 'default');
    return { cleared: true };
  }

  status() {
    return { claudeEnabled: this.claude.enabled, model: this.claude.model };
  }
}
