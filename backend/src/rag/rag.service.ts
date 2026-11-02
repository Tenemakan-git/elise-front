import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { tokenize } from './rag.text';

export interface Passage {
  id: string;
  title: string;
  source: string;
  url: string;
  theme: string;
  heading: string;
  text: string;
}

interface Chunk extends Passage {
  tokens: string[];
  tf: Map<string, number>;
  len: number;
}

export interface Retrieved {
  passage: Passage;
  score: number;
}

/**
 * RagService — recherche lexicale BM25 sur le corpus de sante.
 *
 * Au demarrage : lit rag/corpus/*.md, decoupe chaque document par section
 * (titre ##), construit un index BM25 en memoire. A l'execution : classe les
 * passages par pertinence pour une question. Un seuil minimal permet de
 * repondre "je ne sais pas" quand rien n'est assez proche.
 *
 * Entierement autonome : aucun modele, aucune cle, aucun appel reseau.
 */
@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger('RAG');
  private chunks: Chunk[] = [];
  private df = new Map<string, number>(); // document frequency par terme
  private avgLen = 0;
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  onModuleInit() {
    try {
      this.load();
      this.logger.log(`Index pret : ${this.chunks.length} passages, ${this.df.size} termes.`);
    } catch (e) {
      this.logger.error(`Chargement du corpus impossible : ${(e as Error).message}`);
    }
  }

  get ready() {
    return this.chunks.length > 0;
  }

  private corpusDir(): string {
    const candidates = [
      process.env.RAG_CORPUS_DIR,
      path.join(process.cwd(), 'rag', 'corpus'),
      path.join(__dirname, '..', '..', 'rag', 'corpus'),
      path.join(__dirname, '..', '..', '..', 'rag', 'corpus'),
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    throw new Error(`dossier corpus introuvable (essaye: ${candidates.join(', ')})`);
  }

  /** Lit un en-tete YAML minimal (cle: valeur) en tete de fichier. */
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

  /** Decoupe un corps markdown par section de titre de niveau 2 (##). */
  private splitSections(body: string): { heading: string; text: string }[] {
    const lines = body.split('\n');
    const sections: { heading: string; text: string }[] = [];
    let heading = '';
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join('\n').trim();
      if (text) sections.push({ heading, text });
      buf = [];
    };
    for (const line of lines) {
      const h = line.match(/^##\s+(.*)$/);
      const h1 = line.match(/^#\s+(.*)$/);
      if (h) {
        flush();
        heading = h[1].trim();
      } else if (h1) {
        // le titre de niveau 1 sert d'intro, on le garde comme heading courant
        heading = h1[1].trim();
      } else {
        buf.push(line);
      }
    }
    flush();
    return sections;
  }

  private load() {
    const dir = this.corpusDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
    const chunks: Chunk[] = [];

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { meta, body } = this.parseFrontmatter(raw);
      const title = meta.titre || file.replace(/\.md$/, '');
      const sections = this.splitSections(body);

      sections.forEach((sec, i) => {
        // On prefixe le texte par le titre du document + la section pour le contexte.
        const full = `${title}. ${sec.heading}. ${sec.text}`;
        const tokens = tokenize(full);
        if (tokens.length < 3) return;
        const tf = new Map<string, number>();
        for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
        chunks.push({
          id: `${file}#${i}`,
          title,
          source: meta.source || '',
          url: meta.url || '',
          theme: meta.theme || '',
          heading: sec.heading,
          text: sec.text,
          tokens,
          tf,
          len: tokens.length,
        });
      });
    }

    // Statistiques globales pour BM25.
    const df = new Map<string, number>();
    let total = 0;
    for (const c of chunks) {
      total += c.len;
      for (const term of new Set(c.tokens)) df.set(term, (df.get(term) || 0) + 1);
    }
    this.chunks = chunks;
    this.df = df;
    this.avgLen = chunks.length ? total / chunks.length : 0;
  }

  private idf(term: string): number {
    const n = this.chunks.length;
    const d = this.df.get(term) || 0;
    // IDF BM25, borne a 0 pour ne pas devenir negatif sur les termes tres frequents.
    return Math.max(0, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
  }

  /** Classe les passages pour une requete (BM25). Retourne les meilleurs. */
  retrieve(query: string, k = 3): Retrieved[] {
    if (!this.ready) return [];
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    const qSet = [...new Set(qTokens)];

    const scored: Retrieved[] = this.chunks.map((c) => {
      let score = 0;
      for (const term of qSet) {
        const f = c.tf.get(term);
        if (!f) continue;
        const idf = this.idf(term);
        const denom = f + this.k1 * (1 - this.b + (this.b * c.len) / (this.avgLen || 1));
        score += idf * ((f * (this.k1 + 1)) / denom);
      }
      return { passage: this.toPassage(c), score };
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  private toPassage(c: Chunk): Passage {
    return {
      id: c.id, title: c.title, source: c.source, url: c.url,
      theme: c.theme, heading: c.heading, text: c.text,
    };
  }

  status() {
    return { ready: this.ready, passages: this.chunks.length, terms: this.df.size };
  }
}
