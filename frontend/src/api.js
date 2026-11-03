import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

/**
 * Identifiant de session volatil, garde EN MEMOIRE uniquement (jamais stocke).
 * Il permet au backend de transmettre l'historique au modele le temps de la
 * session, sans aucune trace persistante : un rechargement repart a zero.
 */
let sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
export const getSessionId = () => sessionId;
export const resetSession = () => {
  sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return sessionId;
};
/** Reprendre une conversation existante : réutilise son identifiant. */
export const setSessionId = (id) => { if (id) sessionId = id; return sessionId; };

export const sendChat = (message) => api.post('/chat', { message, sessionId }).then((r) => r.data);
export const getHistory = () => api.get('/chat/history', { params: { sessionId } }).then((r) => r.data);
export const getStatus = () => api.get('/chat/status').then((r) => r.data);
export const getResources = () => api.get('/resources').then((r) => r.data);
export const getResource = (id) => api.get(`/resources/${id}`).then((r) => r.data);

/** Efface l'historique de la session cote serveur (bouton "Tout effacer"). */
export const clearServerHistory = () =>
  api.delete('/chat/history', { params: { sessionId } }).then((r) => r.data).catch(() => ({ cleared: false }));

/**
 * Streaming SSE (type ChatGPT) : lit le flux POST /chat/stream et
 * appelle onEvent({type:'meta'|'chunk'|'done', ...}) au fil de l'eau.
 */
export async function streamChat(message, onEvent) {
  const resp = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });
  if (!resp.ok || !resp.body) throw new Error('stream unavailable');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // les evenements SSE sont separes par \n\n
    const parts = buf.split('\n\n');
    buf = parts.pop(); // derniere partie incomplete reste en buffer
    for (const part of parts) {
      const evMatch = part.match(/^event: (.+)$/m);
      const dataMatch = part.match(/^data: (.+)$/m);
      if (!evMatch || !dataMatch) continue;
      try {
        onEvent({ event: evMatch[1], ...JSON.parse(dataMatch[1]) });
      } catch { /* ignore malformed frame */ }
    }
  }
}
