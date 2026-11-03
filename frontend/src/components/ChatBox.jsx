import { useEffect, useRef, useState } from 'react';
import { IconSend, IconMic } from './Icons.jsx';

/**
 * Reconnaissance vocale via l'API Web Speech du navigateur (SpeechRecognition).
 * Disponible surtout sur Chrome / Chrome Android. La transcription est placee
 * dans le champ texte pour etre RELUE et modifiee avant l'envoi (jamais envoyee
 * automatiquement) : l'utilisatrice garde le controle de ce qui part.
 *
 * Dictee CONTINUE : on ecoute jusqu'a ce que l'utilisatrice re-touche le micro.
 * Les navigateurs coupent la reconnaissance apres un silence meme en mode
 * continu ; on la relance alors automatiquement (onend) et on accumule le texte
 * a travers les redemarrages.
 *
 * Note de confidentialite : selon le navigateur, l'audio peut etre transcrit par
 * un service en ligne ; la voix est un confort optionnel, le texte reste le mode
 * le plus discret.
 */
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function ChatBox({ onSend, loading }) {
  const [v, setV] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const wantRef = useRef(false);   // l'utilisatrice veut-elle continuer a dicter ?
  const baseRef = useRef('');      // texte deja present avant la dictee
  const finalRef = useRef('');     // texte finalise accumule pendant la dictee

  const go = () => {
    if (!v.trim() || loading) return;
    stopVoice();
    onSend(v.trim());
    setV('');
  };

  const stopVoice = () => {
    wantRef.current = false;
    try { recRef.current && recRef.current.stop(); } catch { /* noop */ }
    setListening(false);
  };

  const startRecognition = () => {
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += transcript + ' ';
        else interim += transcript;
      }
      setV((baseRef.current + finalRef.current + interim).replace(/\s+/g, ' ').trimStart());
    };

    // Fin d'un segment : si l'utilisatrice veut toujours dicter, on relance.
    rec.onend = () => {
      if (wantRef.current) {
        try { rec.start(); return; } catch { /* on tente une nouvelle instance */ }
        try { startRecognition(); return; } catch { /* noop */ }
      }
      setListening(false);
    };

    rec.onerror = (e) => {
      // Permission refusee / service indisponible : on arrete pour de bon.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantRef.current = false;
        setListening(false);
      }
      // 'no-speech' / 'aborted' : onend relancera si wantRef est vrai.
    };

    recRef.current = rec;
    try { rec.start(); } catch { /* deja demarre */ }
  };

  const startVoice = () => {
    if (!SR) return;
    baseRef.current = v ? v.trim() + ' ' : '';
    finalRef.current = '';
    wantRef.current = true;
    setListening(true);
    startRecognition();
  };

  const toggleVoice = () => (listening ? stopVoice() : startVoice());

  // Arret propre si le composant disparait.
  useEffect(() => () => { wantRef.current = false; try { recRef.current && recRef.current.stop(); } catch { /* noop */ } }, []);

  return (
    <div className="bar">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
        placeholder={listening ? 'Parlez, j’écoute… (touchez le micro pour arrêter)' : 'Écrivez ou dictez votre message…'}
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
