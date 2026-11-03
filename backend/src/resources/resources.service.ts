import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RESOURCES, ResourceDef } from './resources.data';

export interface ResourceSummary {
  id: string;
  title: string;
  category: string;
  icon: string;
  intro: string;
}

export interface ResourceArticle extends ResourceSummary {
  /** Corps de l'article en HTML sur (converti depuis le markdown de la fiche). */
  html: string;
  source: string;
  url: string;
  ask: string;
}

/**
 * ResourcesService — sert les ressources comme articles documentes.
 * Lit la fiche du corpus associee, parse son frontmatter et convertit son
 * markdown en HTML sur (le corpus est du contenu de confiance, redige par nous).
 */
@Injectable()
export class ResourcesService {
  private readonly logger = new Logger('Resources');
  private cache = new Map<string, ResourceArticle>();

  private corpusDir(): string {
    const candidates = [
      process.env.RAG_CORPUS_DIR,
      path.join(process.cwd(), 'rag', 'corpus'),
      path.join(__dirname, '..', '..', 'rag', 'corpus'),
      path.join(__dirname, '..', '..', '..', 'rag', 'corpus'),
    ].filter(Boolean) as string[];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error('dossier corpus introuvable');
  }

  /** Liste des ressources (sans le corps), pour l'affichage en liste. */
  list(): ResourceSummary[] {
    return RESOURCES.map(({ id, title, category, icon, intro }) => ({ id, title, category, icon, intro }));
  }

  /** Un article complet (corps HTML + source). */
  article(id: string): ResourceArticle {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const def = RESOURCES.find((r) => r.id === id);
    if (!def) throw new NotFoundException('ressource inconnue');
    const built = this.build(def);
    this.cache.set(id, built);
    return built;
  }

  private build(def: ResourceDef): ResourceArticle {
    const file = path.join(this.corpusDir(), def.file);
    let raw = '';
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      this.logger.warn(`Fiche manquante pour la ressource ${def.id} : ${def.file}`);
    }
    const { meta, body } = this.parseFrontmatter(raw);
    return {
      id: def.id,
      title: def.title,
      category: def.category,
      icon: def.icon,
      intro: def.intro,
      html: this.mdToHtml(body),
      source: meta.source || '',
      url: meta.url || '',
      ask: def.ask,
    };
  }

  private parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: raw };
    const meta: Record<string, string> = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
    return { meta, body: m[2] };
  }

  /** Echappe les caracteres HTML d'un fragment de texte. */
  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Formatage inline : gras et liens. */
  private inline(s: string): string {
    let out = this.esc(s);
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    return out;
  }

  /**
   * Convertit le markdown d'une fiche en HTML sur. Gere : titres ##/###,
   * listes a puces et numerotees, paragraphes, gras, liens. Le titre de
   * niveau 1 (#) est retire (il est deja affiche a part).
   */
  private mdToHtml(md: string): string {
    const lines = md.replace(/\r/g, '').split('\n');
    const out: string[] = [];
    let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
    let para: string[] = [];

    const flushPara = () => {
      if (para.length) { out.push(`<p>${this.inline(para.join(' '))}</p>`); para = []; }
    };
    const flushList = () => {
      if (list) { out.push(`<${list.type}>${list.items.map((i) => `<li>${this.inline(i)}</li>`).join('')}</${list.type}>`); list = null; }
    };
    const flush = () => { flushPara(); flushList(); };

    for (const line of lines) {
      const t = line.trim();
      if (!t) { flush(); continue; }
      if (/^#\s+/.test(t)) { flush(); continue; } // titre H1 : retire
      if (/^##\s+/.test(t)) { flush(); out.push(`<h3>${this.inline(t.replace(/^##\s+/, ''))}</h3>`); continue; }
      if (/^###\s+/.test(t)) { flush(); out.push(`<h4>${this.inline(t.replace(/^###\s+/, ''))}</h4>`); continue; }
      const bullet = t.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        flushPara();
        if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
        list.items.push(bullet[1]);
        continue;
      }
      const num = t.match(/^\d+[.)]\s+(.*)$/);
      if (num) {
        flushPara();
        if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
        list.items.push(num[1]);
        continue;
      }
      flushList();
      para.push(t);
    }
    flush();
    return out.join('\n');
  }
}
