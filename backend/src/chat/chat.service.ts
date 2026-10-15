import { Injectable } from '@nestjs/common';
import { ClaudeService, StreamEvent } from './claude.service';

interface HistItem {
  id: string;
  question: string;
  answer: string;
  level: string;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  private historyStore: HistItem[] = [];
  private seq = 1;

  constructor(private claude: ClaudeService) {}

  /** Flux SSE : chaque evenement est ecrit ligne par ligne (type evenement + JSON). */
  async *stream(message: string): AsyncGenerator<string> {
    let finalLevel = 'green';
    let full = '';
    for await (const ev of this.claude.streamAnswer(message) as AsyncGenerator<StreamEvent>) {
      if (ev.type === 'done') finalLevel = ev.level;
      if (ev.type === 'chunk') full += ev.html;
      yield `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
    }
    this.historyStore.unshift({
      id: String(this.seq++),
      question: message,
      answer: full,
      level: finalLevel,
      createdAt: new Date(),
    });
  }

  async send(message: string) {
    const { answer, classification } = await this.claude.classifyAndAnswer(message);
    const item: HistItem = {
      id: String(this.seq++),
      question: message,
      answer,
      level: classification.level,
      createdAt: new Date(),
    };
    this.historyStore.unshift(item);
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

  history(limit = 50) {
    return this.historyStore.slice(0, limit);
  }

  status() {
    return { claudeEnabled: this.claude.enabled, model: this.claude.model };
  }
}
