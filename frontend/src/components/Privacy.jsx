import { useEffect, useRef } from 'react';
import { IconLock, IconAlert } from './Icons.jsx';

/**
 * Sortie rapide : efface l'ecran affiche et remplace la page par une page neutre,
 * SANS laisser d'entree "Elise" dans l'historique (location.replace).
 * On navigue vers une page meteo publique : un "Retour" ne ramene pas a Elise.
 */
export function quickExit(onBeforeLeave) {
  try { onBeforeLeave && onBeforeLeave(); } catch { /* noop */ }
  // Remplace l'entree courante : le bouton Retour ne revient pas sur Elise.
  window.location.replace('https://www.google.com/search?q=meteo+abidjan');
}

/**
 * Bouton de sortie rapide, place dans le header (toujours visible car header
 * sticky). Raccourci clavier : touche Echap, actif partout dans l'application.
 */
export function QuickExitBar({ onExit }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <button className="quick-exit" onClick={onExit} aria-label="Quitter rapidement (touche Echap)">
      <IconAlert size={15} />
      <span>Quitter rapidement</span>
      <kbd>Echap</kbd>
    </button>
  );
}

/** Panneau "Votre confidentialite" : reglages, effacement, "Ce que nous gardons". */
export function PrivacyPanel({ open, onClose, onClearConversation, onClearAll, discreet, onToggleDiscreet }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pv-overlay" onClick={onClose}>
      <div className="pv-sheet" ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Votre confidentialite">
        <div className="pv-head">
          <span><IconLock size={16} /> Votre confidentialité</span>
          <button className="pv-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div className="pv-sec">
          <label className="pv-switch">
            <input type="checkbox" checked={discreet} onChange={onToggleDiscreet} />
            <span>Mode discret — onglet et icône « Notes »</span>
          </label>
          <p className="pv-hint">L'onglet du navigateur affiche « Notes » au lieu d'Élise.</p>
        </div>

        <div className="pv-sec">
          <div className="pv-actions">
            <button className="pv-btn" onClick={onClearConversation}>Effacer cette conversation</button>
            <button className="pv-btn danger" onClick={onClearAll}>Tout effacer</button>
          </div>
        </div>

        <div className="pv-sec">
          <div className="pv-keep-title">Ce que nous gardons</div>
          <ul className="pv-keep">
            <li>Votre nom n'est jamais demandé.</li>
            <li>La conversation reste sur ce téléphone uniquement.</li>
            <li>Aucun contenu identifiable n'est conservé sur nos serveurs.</li>
            <li>Aucun compte, aucun traceur, aucune publicité.</li>
          </ul>
          <p className="pv-hint">La dictée vocale utilise le service de reconnaissance de votre navigateur et peut traiter votre voix en ligne ; dans le doute, écrivez votre message.</p>
        </div>
      </div>
    </div>
  );
}
