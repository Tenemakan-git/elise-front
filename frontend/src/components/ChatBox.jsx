import { useState } from 'react';
import { IconSend } from './Icons.jsx';

export default function ChatBox({ onSend, loading }) {
  const [v, setV] = useState('');
  const go = () => {
    if (!v.trim() || loading) return;
    onSend(v.trim());
    setV('');
  };
  return (
    <div className="bar">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder="Écrivez votre message…"
      />
      <button onClick={go} disabled={loading || !v.trim()} aria-label="Envoyer">
        <IconSend size={17} />
      </button>
    </div>
  );
}
