import { useEffect, useRef, useState } from 'react';
import { IconSend, IconMic } from './Icons.jsx';

/**
 * Reconnaissance vocale via l'API Web Speech du navigateur (SpeechRecognition).
 * Disponible surtout sur Chrome / Chrome Android. La transcription est placee
 * dans le champ texte pour etre RELUE et modifiee avant l'envoi (jamais envoyee
 * automatiquement) : l'utilisatrice garde le controle de ce qui part.
 *
 * Note de confidentialite : selon le navigateur, l'audio peut etre transcrit par
 * un service en ligne (ex. Chrome). La voix est donc un confort optionnel ; le
 * texte reste le mode le plus discret.
 */
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function ChatBox({ onSend, loading }) {
  const [v, setV] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const baseRef = useRef(''); // texte deja saisi avant de parler

  const go = () => {
    if (!v.trim() || loading) return;
    stopVoice();
    onSend(v.trim());
    setV('');
  };

  const stopVoice = () => {
    try { recRef.current && recRef.current.stop(); } catch { /* noop */ }
    setListening(false);
  };

  const startVoice = () => {
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    baseRef.current = v ? v.trim() + ' ' : '';
    rec.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setV(baseRef.current + txt);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  const toggleVoice = () => (listening ? stopVoice() : startVoice());

  // Arret propre si le composant disparait.
  useEffect(() => () => stopVoice(), []);

  return (
    <div className="bar">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder={listening ? 'Parlez, j’écoute…' : 'Écrivez ou dictez votre message…'}
      />
      {SR && (
        <button
          type="button"
          className={'mic' + (listening ? ' on' : '')}
          onClick={toggleVoice}
          disabled={loading}
          aria-label={listening ? 'Arrêter la dictée' : 'Dicter à la voix'}
          title={listening ? 'Arrêter la dictée' : 'Dicter à la voix'}
        >
          <IconMic size={18} />
        </button>
      )}
      <button onClick={go} disabled={loading || !v.trim()} aria-label="Envoyer">
        <IconSend size={17} />
      </button>
    </div>
  );
}
