/**
 * history.js — Historique des conversations, stocké UNIQUEMENT sur l'appareil.
 *
 * Choix de conception (confidentialité) : rien n'est envoyé ni conservé sur un
 * serveur, aucun compte. Les conversations vivent dans le localStorage de CE
 * navigateur, et l'utilisatrice peut les supprimer à tout moment (une par une
 * ou toutes). La sortie rapide efface tout l'historique local.
 *
 * Tout accès est protégé par try/catch : navigation privée, stockage plein ou
 * bloqué ne doivent jamais casser l'application.
 */

const KEY = 'elise.history.v1';

/** Charge toutes les sessions, les plus récentes d'abord. */
export function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Titre lisible d'une session : son premier message utilisateur, tronqué. */
function titleFrom(msgs) {
  const firstUser = (msgs || []).find((m) => m.who === 'user');
  const t = firstUser ? String(firstUser.html || '').replace(/<[^>]+>/g, '').trim() : '';
  if (!t) return 'Nouvelle conversation';
  return t.length > 42 ? t.slice(0, 42) + '…' : t;
}

/**
 * Enregistre (ou met à jour) une session. On ne sauvegarde que s'il y a au
 * moins un échange réel (un message utilisateur), pour ne pas créer d'entrées
 * vides. Les messages en cours de streaming ne sont pas persistés.
 */
export function saveSession(id, msgs) {
  if (!id) return;
  const hasUser = (msgs || []).some((m) => m.who === 'user');
  if (!hasUser) return;
  const clean = (msgs || [])
    .filter((m) => !m.streaming)
    .map((m) => ({ who: m.who, level: m.level ?? null, html: m.html, emg: !!m.emg, via: m.via, source: m.source ?? null }));
  const list = loadAll();
  const existing = list.findIndex((s) => s.id === id);
  const entry = { id, title: titleFrom(clean), updatedAt: Date.now(), msgs: clean };
  if (existing >= 0) list[existing] = entry; else list.push(entry);
  writeAll(list);
}

export function getSession(id) {
  return loadAll().find((s) => s.id === id) || null;
}

export function removeSession(id) {
  writeAll(loadAll().filter((s) => s.id !== id));
}

export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
