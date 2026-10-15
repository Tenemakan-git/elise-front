import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

export const sendChat = (message) => api.post('/chat', { message }).then((r) => r.data);
export const getHistory = () => api.get('/chat/history').then((r) => r.data);
export const getStatus = () => api.get('/chat/status').then((r) => r.data);
export const getResources = () => api.get('/resources').then((r) => r.data);

/**
 * Streaming SSE (type ChatGPT) : lit le flux POST /chat/stream et
 * appelle onEvent({type:'meta'|'chunk'|'done', ...}) au fil de l'eau.
 */
export async function streamChat(message, onEvent) {
  const resp = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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
