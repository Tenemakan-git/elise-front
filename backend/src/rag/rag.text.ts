/**
 * rag.text.ts — Outils de traitement du texte pour la recherche lexicale.
 *
 * Choix : recherche lexicale (BM25) plutot qu'embeddings, pour un systeme
 * totalement autonome (aucun modele a telecharger, aucune cle, aucun reseau),
 * donc fiable en demo et sur Railway. On compense l'absence de semantique par :
 *   - une normalisation robuste (minuscule, sans accents, sans ponctuation) ;
 *   - une racinisation legere (regles/regle, fertile/fertilite) ;
 *   - une expansion par synonymes du vocabulaire de sante.
 */

/** Minuscule + suppression des accents + ponctuation -> espaces. */
export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mots vides francais (liste compacte). */
const STOP = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'et', 'ou', 'a', 'au', 'aux',
  'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'moi', 'toi',
  'que', 'qui', 'quoi', 'dont', 'ou', 'quand', 'comment', 'pourquoi', 'est', 'es', 'suis',
  'sont', 'etre', 'ete', 'avoir', 'ai', 'as', 'avons', 'avez', 'ont', 'pas', 'ne', 'plus',
  'pour', 'par', 'avec', 'sans', 'dans', 'sur', 'sous', 'en', 'y', 'si', 'mais', 'donc',
  'car', 'ni', 'or', 'aussi', 'tout', 'tous', 'toute', 'toutes', 'mon', 'fait', 'faire',
  'peut', 'peux', 'puis', 'dois', 'doit', 'leur', 'leurs', 'cela', 'ca', 'c', 's', 'n', 'j', 'm', 't',
]);

/**
 * Racinisation legere : retire quelques suffixes frequents pour rapprocher
 * les formes d'un meme mot. Volontairement prudente (pas un vrai stemmer).
 */
function stem(tok: string): string {
  let t = tok;
  if (t.length > 6) {
    t = t.replace(/(ations?|ements?|issements?)$/,'');
  }
  if (t.length > 5) {
    t = t.replace(/(ales?|aux|elles?|ables?|ibles?)$/,'');
  }
  if (t.length > 4) {
    t = t.replace(/(euses?|eurs?|trices?)$/,'');
  }
  if (t.length > 4) {
    t = t.replace(/(es|s|e)$/,'');
  }
  return t;
}

/**
 * Groupes de synonymes / vocabulaire proche. Chaque mot d'un groupe est
 * ramene a un jeton canonique commun, pour que "ovulation", "feconde" et
 * "tomber enceinte" se rejoignent.
 */
const SYNONYMS: Record<string, string[]> = {
  fertilite: ['fertile', 'fecond', 'feconde', 'fecondite', 'ovulation', 'ovule', 'ponte', 'nidation'],
  grossesse: ['enceinte', 'grossesse', 'gestation', 'prenatal', 'prenatale', 'accouchement'],
  regles: ['regle', 'regles', 'menstruation', 'menstruations', 'menstruel', 'menstruelle', 'menstrue', 'menstrues', 'cycle', 'saignement'],
  contraception: ['contraception', 'contraceptif', 'pilule', 'preservatif', 'condom', 'implant', 'diu', 'sterilet'],
  urgence_contra: ['lendemain', 'urgence', 'rattrapage'],
  ist: ['ist', 'mst', 'infection', 'depistage', 'depister', 'chlamydia', 'gonorrhee', 'syphilis', 'herpes', 'vih', 'sida', 'mycose', 'trichomonas'],
  douleur: ['douleur', 'mal', 'crampe', 'dysmenorrhee'],
  violence: ['violence', 'agression', 'viol', 'forcee', 'force', 'abus', 'vbg'],
  mental: ['triste', 'tristesse', 'deprime', 'depression', 'anxiete', 'angoisse', 'stress', 'seule', 'solitude', 'suicide'],
  puberte: ['puberte', 'adolescente', 'adolescent', 'premiere'],
  hygiene: ['hygiene', 'serviette', 'tampon', 'protection', 'laver', 'propre'],
};

/** Table inverse : mot normalise -> jeton canonique. */
const CANON: Record<string, string> = {};
for (const [canon, words] of Object.entries(SYNONYMS)) {
  for (const w of words) CANON[w] = canon;
}

/** Transforme un texte en liste de jetons (sans stopwords, racinises, synonymes). */
export function tokenize(text: string): string[] {
  const raw = normalize(text).split(' ').filter(Boolean);
  const out: string[] = [];
  for (const w of raw) {
    if (STOP.has(w)) continue;
    if (w.length < 2) continue;
    // Synonyme direct sur le mot entier
    if (CANON[w]) {
      out.push(CANON[w]);
      continue;
    }
    const s = stem(w);
    out.push(CANON[s] || s);
  }
  return out;
}
