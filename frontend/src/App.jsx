import { useEffect, useRef, useState } from 'react';
import ChatBox from './components/ChatBox.jsx';
import {
  IconChat, IconBook, IconLifebuoy, IconShield, IconPhone, IconLock,
  IconDroplet, IconPill, IconActivity, IconHeart, IconUsers, IconAlert,
  IconChevron, IconMapPin,
} from './components/Icons.jsx';
import { QuickExitBar, PrivacyPanel, quickExit } from './components/Privacy.jsx';
import { streamChat, getStatus, getResources, clearServerHistory, resetSession } from './api.js';

const LOGO = '/logo-elise.png';
const LVL = {
  green: { t: 'Information', c: 'g' },
  yellow: { t: 'Surveillance', c: 'y' },
  orange: { t: 'Consultation', c: 'o' },
  red: { t: 'Urgence', c: 'r' },
};
const CARDS_ICON = { cycle: IconDroplet, contra: IconPill, ist: IconShield, mental: IconActivity, grossesse: IconHeart, violence: IconUsers };
const WELCOME = { who: 'bot', level: null, html: 'Je suis <b>Élise</b>. Posez vos questions sur le cycle, la contraception, les IST ou la santé mentale — cet espace est confidentiel et sans jugement.' };

function Emergency() {
  return (
    <div className="emg">
      <div className="emg-title"><IconAlert size={16} /> Assistance immédiate — gratuit et confidentiel</div>
      <a href="tel:185" className="emg-call">
        <span className="emg-num">185</span>
        <span className="emg-info"><b>SAMU</b><small>Urgence médicale</small></span>
        <IconPhone size={20} />
      </a>
      <a href="tel:1308" className="emg-call">
        <span className="emg-num">1308</span>
        <span className="emg-info"><b>Violences (VBG)</b><small>Ligne verte, 24h/24</small></span>
        <IconPhone size={20} />
      </a>
      <a href="tel:139" className="emg-call">
        <span className="emg-num">139</span>
        <span className="emg-info"><b>Écoute psychologique</b><small>Confidentiel</small></span>
        <IconPhone size={20} />
      </a>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('chat');
  const [msgs, setMsgs] = useState([WELCOME]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ claudeEnabled: false, model: '' });
  const [res, setRes] = useState([]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [discreet, setDiscreet] = useState(true);
  const [hidden, setHidden] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => { getStatus().then(setStatus).catch(() => {}); getResources().then(setRes).catch(() => {}); }, []);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [msgs, loading, tab]);

  // Mode discret : titre d'onglet neutre. Desactive -> nom reel.
  useEffect(() => {
    document.title = discreet ? 'Notes' : 'Élise';
  }, [discreet]);

  // Ecran masque hors focus : l'apercu du selecteur d'applications n'affiche rien de lisible.
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', () => setHidden(true));
    window.addEventListener('focus', () => setHidden(false));
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const onExit = () => quickExit(() => { setMsgs([WELCOME]); });

  const clearConversation = async () => {
    setMsgs([WELCOME]);
    await clearServerHistory();
    resetSession();
    setPrivacyOpen(false);
  };
  const clearAll = async () => {
    setMsgs([WELCOME]);
    await clearServerHistory();
    resetSession();
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* noop */ }
    setPrivacyOpen(false);
  };

  const push = async (text) => {
    setMsgs((m) => [...m, { who: 'user', html: text }, { who: 'bot', level: null, html: '', streaming: true }]);
    setLoading(true);
    let accHtml = '';
    let finalLevel = 'green';
    let via = 'local';
    try {
      await streamChat(text, (ev) => {
        if (ev.type === 'meta') {
          via = ev.via;
          setMsgs((m) => {
            const copy = [...m];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].who === 'bot' && copy[i].streaming) { copy[i] = { ...copy[i], level: ev.level }; break; }
            }
            return copy;
          });
        } else if (ev.type === 'chunk') {
          accHtml = ev.html;
          setMsgs((m) => {
            const copy = [...m];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].who === 'bot' && copy[i].streaming) { copy[i] = { ...copy[i], html: ev.html }; break; }
            }
            return copy;
          });
        } else if (ev.type === 'done') {
          finalLevel = ev.level || finalLevel;
          const source = ev.source || null;
          let extra = '';
          if (finalLevel === 'orange') extra = '<br><br>Prochaine étape conseillée : consulter une sage-femme ou un centre de planning familial à Abidjan cette semaine.';
          if (finalLevel === 'yellow') extra = '<br><br>Suivi : reviens dans 2 à 3 jours me donner des nouvelles de l’évolution.';
          setMsgs((m) => {
            const copy = [...m];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].who === 'bot' && copy[i].streaming) {
                copy[i] = { who: 'bot', level: finalLevel, html: (accHtml || copy[i].html) + extra, emg: finalLevel === 'red', via, source };
                break;
              }
            }
            return copy;
          });
        }
      });
    } catch {
      setMsgs((m) => {
        const copy = [...m];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].who === 'bot' && copy[i].streaming) {
            copy[i] = { who: 'bot', level: 'red', html: 'Service indisponible. Vérifiez que le backend est actif sur le port 3001.' };
            break;
          }
        }
        return copy;
      });
    }
    setLoading(false);
  };

  return (<>
    {/* Ecran masque hors focus : rien de lisible dans l'apercu du selecteur d'applications */}
    {hidden && <div className="screen-shield" aria-hidden="true"><span>Notes</span></div>}

    <header className="top">
      <img src={LOGO} alt="Élise" className="logo-img" />
      <div className="brand">
        <h1>ÉLISE</h1>
        <small>Conversation non enregistrée</small>
      </div>
      <div className="pills">
        <QuickExitBar onExit={onExit} />
        <button className="pill lock" onClick={() => setPrivacyOpen(true)} aria-label="Ouvrir les réglages de confidentialité">
          <IconLock size={13} /> Confidentiel
        </button>
      </div>
    </header>

    <div className="layout">
      <nav className="side">
        <div className="sec">Navigation</div>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><IconChat /> Conversation</button>
        <button className={tab === 'res' ? 'active' : ''} onClick={() => setTab('res')}><IconBook /> Ressources</button>
        <button className={tab === 'aide' ? 'active' : ''} onClick={() => setTab('aide')}><IconLifebuoy /> Besoin d’aide</button>
        <button className={tab === 'safety' ? 'active' : ''} onClick={() => setTab('safety')}><IconShield /> Comment Élise vous protège</button>
        <div className="sec">Urgences</div>
        <div className="side-urg">
          <div><span>SAMU</span><b>185</b></div>
          <div><span>Violences (VBG)</span><b>1308</b></div>
          <div><span>Écoute psychologique</span><b>139</b></div>
        </div>
      </nav>

      {tab === 'chat' && (<section className="panel">
        <div className="hero">
          <img src={LOGO} alt="" className="hero-img" />
          <div>
            <h2>Comment puis-je vous aider aujourd’hui ?</h2>
            <p>Cycle, contraception, infections sexuellement transmissibles, santé mentale : chaque message est analysé pour vous orienter vers un accompagnement réel lorsque la situation le demande.</p>
            <div className="quick">
              <button className="urgent" onClick={() => push("On m'a forcée à avoir un rapport, que faire ?")}><IconAlert size={15} /> Situation d’urgence</button>
              <button onClick={() => push('Douleurs de règles très fortes, est-ce normal ?')}>Douleurs de règles</button>
              <button onClick={() => push('Explique mon cycle et ma période fertile')}>Cycle et fertilité</button>
              <button onClick={() => push('Quels sont les moyens de contraception ?')}>Contraception</button>
            </div>
          </div>
        </div>
        <div className="chat" ref={chatRef}>
          {msgs.map((m, i) => {
            if (m.who === 'user') return <div key={i} className="msg user">{m.html}</div>;
            const l = m.level ? LVL[m.level] : null;
            return (
              <div key={i} className="msg bot">
                {l && <span className={'lvl ' + l.c}>{l.t}</span>}
                <span dangerouslySetInnerHTML={{ __html: m.html }} />
                {m.streaming && !m.html && (
                  <span className="dots"><i /><i /><i /></span>
                )}
                {m.streaming && <span className="cursor" />}
                {m.source && (
                  <span className="src">
                    Source : {m.source.url
                      ? <a href={m.source.url} target="_blank" rel="noopener noreferrer">{m.source.source || m.source.title}</a>
                      : (m.source.source || m.source.title)}
                  </span>
                )}
                {m.emg && <Emergency />}
              </div>
            );
          })}
        </div>
        <ChatBox onSend={push} loading={loading} />
      </section>)}

      {tab === 'res' && (<section className="panel scroll">
        <div className="hero">
          <img src={LOGO} alt="" className="hero-img" />
          <div><h2>Ressources vérifiées</h2><p>Sélectionnez un thème pour l’envoyer directement dans la conversation.</p></div>
        </div>
        <div className="list">
          {res.map((r) => {
            const Ico = CARDS_ICON[r.id] || IconBook;
            return (
              <button key={r.id} className="row" onClick={() => { setTab('chat'); push(r.question); }}>
                <span className="row-ico"><Ico size={18} /></span>
                <span className="row-body">
                  <span className="row-title">{r.title}</span>
                  <span className="row-desc">{r.desc}</span>
                </span>
                <IconChevron size={16} />
              </button>
            );
          })}
        </div>
      </section>)}

      {tab === 'aide' && (<section className="panel scroll">
        <div className="hero">
          <img src={LOGO} alt="" className="hero-img" />
          <div><h2>Besoin d’aide immédiate</h2><p>En cas de danger, ne restez pas seule. Ces numéros sont gratuits, confidentiels et disponibles en Côte d’Ivoire.</p></div>
        </div>
        <div className="pad">
          <Emergency />
          <button className="tip tip-btn" onClick={() => push('Je suis en danger mais je ne peux pas parler, aide-moi')}>
            <IconMapPin size={16} />
            <div><b>Vous ne pouvez pas parler ?</b><p>Appuyez ici : Élise prépare un message d’alerte et les numéros à contacter discrètement.</p></div>
          </button>
        </div>
      </section>)}

      {tab === 'safety' && (<section className="panel scroll">
        <div className="hero">
          <img src={LOGO} alt="" className="hero-img" />
          <div><h2>Comment Élise vous protège</h2><p>Chaque message est classé automatiquement en quatre niveaux, avec l’action associée.</p></div>
        </div>
        <div className="pad">
          <div className="scale">
            <div className="scale-bar"><i className="sg" /><i className="sy" /><i className="so" /><i className="sr" /></div>
            <div className="scale-lbl"><span>Risque faible</span><span>Urgence</span></div>
          </div>
          <div className="safety-row g"><span className="safety-num">1</span><div className="safety-body"><span className="st">Information</span><p>Réponse directe et éducative. Exemples : cycle, fertilité, hygiène.</p></div></div>
          <div className="safety-row y"><span className="safety-num">2</span><div className="safety-body"><span className="st">Surveillance</span><p>Situation à suivre. Conseil sans conservation : si cela persiste, consultez.</p></div></div>
          <div className="safety-row o"><span className="safety-num">3</span><div className="safety-body"><span className="st">Consultation</span><p>Professionnel de santé recommandé. Exemples : retard de règles, signes d’IST, demande de médicament.</p></div></div>
          <div className="safety-row r"><span className="safety-num">4</span><div className="safety-body"><span className="st">Urgence</span><p>Message d’urgence validé et contacts affichés immédiatement. Exemples : agression, idées noires, hémorragie.</p></div></div>
        </div>
      </section>)}
    </div>

    <footer>
      Élise — Hackathon L’Aube de l’Intelligence Artificielle, Édition 2 (BAIC)<br />
      Élise informe et oriente ; elle ne remplace pas un professionnel de santé. En cas d’urgence : 185.
    </footer>

    {/* Navigation principale mobile : barre d'onglets fixe en bas (masquee sur desktop) */}
    <nav className="tabbar" role="tablist" aria-label="Navigation principale">
      <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
        <IconChat size={21} /><span>Conversation</span>
      </button>
      <button role="tab" aria-selected={tab === 'res'} className={tab === 'res' ? 'active' : ''} onClick={() => setTab('res')}>
        <IconBook size={21} /><span>Ressources</span>
      </button>
      <button role="tab" aria-selected={tab === 'aide'} className={tab === 'aide' ? 'active' : ''} onClick={() => setTab('aide')}>
        <IconLifebuoy size={21} /><span>Aide</span>
      </button>
      <button role="tab" aria-selected={tab === 'safety'} className={tab === 'safety' ? 'active' : ''} onClick={() => setTab('safety')}>
        <IconShield size={21} /><span>Protection</span>
      </button>
    </nav>

    <PrivacyPanel
      open={privacyOpen}
      onClose={() => setPrivacyOpen(false)}
      onClearConversation={clearConversation}
      onClearAll={clearAll}
      discreet={discreet}
      onToggleDiscreet={() => setDiscreet((d) => !d)}
    />
  </>);
}
