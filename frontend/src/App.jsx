import { useEffect, useRef, useState } from 'react';
import ChatBox from './components/ChatBox.jsx';
import {
  IconChat, IconBook, IconLifebuoy, IconShield, IconPhone, IconLock,
  IconDroplet, IconPill, IconActivity, IconHeart, IconUsers, IconAlert,
  IconChevron, IconMapPin, IconClock,
} from './components/Icons.jsx';
import { QuickExitBar, PrivacyPanel, quickExit } from './components/Privacy.jsx';
import { streamChat, getStatus, getResources, getResource, clearServerHistory, resetSession, setSessionId, getSessionId } from './api.js';
import { loadAll as loadHistory, saveSession, getSession, removeSession, clearAll as clearHistory } from './history.js';

const LOGO = '/logo-elise.png';
const LVL = {
  green: { t: 'Information', c: 'g' },
  yellow: { t: 'Surveillance', c: 'y' },
  orange: { t: 'Consultation', c: 'o' },
  red: { t: 'Urgence', c: 'r' },
};
const RES_ICON = { droplet: IconDroplet, pill: IconPill, shield: IconShield, activity: IconActivity, heart: IconHeart, users: IconUsers, mappin: IconMapPin, book: IconBook };
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
        <span className="emg-info"><b>Violences (VBG)</b><small>Ligne verte, 24h/24 — écoute et soutien</small></span>
        <IconPhone size={20} />
      </a>
    </div>
  );
}

/** Liste des conversations enregistrées (sur l'appareil). Réutilisée sidebar + mobile. */
function ConvList({ sessions, currentId, onNew, onLoad, onDelete }) {
  return (
    <div className="conv">
      <button className="conv-new" onClick={onNew}>＋ Nouvelle conversation</button>
      {sessions.length === 0 && <div className="conv-empty">Aucune conversation enregistrée.</div>}
      {sessions.map((s) => (
        <div key={s.id} className={'conv-row' + (s.id === currentId ? ' active' : '')}>
          <button className="conv-open" onClick={() => onLoad(s.id)} title={s.title}>{s.title}</button>
          <button className="conv-del" onClick={() => onDelete(s.id)} aria-label="Supprimer cette conversation">×</button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('chat');
  const [msgs, setMsgs] = useState([WELCOME]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ claudeEnabled: false, model: '' });
  const [res, setRes] = useState([]);
  const [article, setArticle] = useState(null); // article de ressource en lecture
  const [articleLoading, setArticleLoading] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [discreet, setDiscreet] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [sessions, setSessions] = useState([]);      // historique local (sur l'appareil)
  const [currentId, setCurrentId] = useState(getSessionId());
  const [historyOpen, setHistoryOpen] = useState(false); // panneau historique (mobile)
  const chatRef = useRef(null);

  // Historique local : charge la liste au démarrage.
  useEffect(() => { setSessions(loadHistory()); }, []);

  // Sauvegarde la conversation courante sur l'appareil quand une réponse se termine.
  useEffect(() => {
    if (loading) return;
    saveSession(currentId, msgs);
    setSessions(loadHistory());
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const newConversation = () => {
    setMsgs([WELCOME]);
    setCurrentId(resetSession());
    setHistoryOpen(false);
    setTab('chat');
  };
  const loadConversation = (id) => {
    const s = getSession(id);
    if (!s) return;
    setMsgs(s.msgs && s.msgs.length ? s.msgs : [WELCOME]);
    setSessionId(id);
    setCurrentId(id);
    setHistoryOpen(false);
    setTab('chat');
  };
  const deleteConversation = (id) => {
    removeSession(id);
    setSessions(loadHistory());
    if (id === currentId) newConversation();
  };

  const openArticle = async (id) => {
    setArticleLoading(true);
    setArticle({ id, loading: true });
    try { setArticle(await getResource(id)); }
    catch { setArticle(null); }
    finally { setArticleLoading(false); }
  };

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

  // Sortie rapide : efface l'ecran ET tout l'historique local (ne laisse aucune trace).
  const onExit = () => quickExit(() => { clearHistory(); setMsgs([WELCOME]); });

  const clearConversation = async () => {
    removeSession(currentId);
    setSessions(loadHistory());
    setMsgs([WELCOME]);
    await clearServerHistory();
    setCurrentId(resetSession());
    setPrivacyOpen(false);
  };
  const clearAll = async () => {
    setMsgs([WELCOME]);
    await clearServerHistory();
    clearHistory();
    setSessions([]);
    setCurrentId(resetSession());
    try { sessionStorage.clear(); } catch { /* noop */ }
    setPrivacyOpen(false);
  };

  const push = async (text) => {
    // Historique envoyé au serveur (il ne conserve rien) : la conversation
    // jusqu'ici, sans le message d'accueil ni les messages en cours de stream.
    const history = [];
    let seenUser = false;
    for (const m of msgs) {
      if (m.streaming) continue;
      const content = String(m.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!content) continue;
      if (m.who === 'user') { seenUser = true; history.push({ role: 'user', content }); }
      else if (m.who === 'bot' && seenUser) { history.push({ role: 'assistant', content }); }
    }

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
          // Pas d'ajout automatique selon le niveau : la réponse contient déjà
          // l'orientation adaptée. Un suivi « reviens dans 2-3 jours » collé à une
          // question d'information était hors de propos.
          const extra = '';
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
      }, history);
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
        <button className="pill hist-btn" onClick={() => setHistoryOpen(true)} aria-label="Mes conversations">
          <IconClock size={14} />
        </button>
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
        <div className="sec">Mes conversations</div>
        <ConvList sessions={sessions} currentId={currentId} onNew={newConversation} onLoad={loadConversation} onDelete={deleteConversation} />
        <div className="sec">Urgences</div>
        <div className="side-urg">
          <div><span>SAMU</span><b>185</b></div>
          <div><span>Violences (VBG)</span><b>1308</b></div>
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

      {tab === 'res' && !article && (<section className="panel scroll">
        <div className="hero">
          <img src={LOGO} alt="" className="hero-img" />
          <div><h2>Ressources vérifiées</h2><p>Des fiches documentées et sourcées, à lire tranquillement. Touchez une fiche pour l’ouvrir.</p></div>
        </div>
        {[...new Set(res.map((r) => r.category))].map((cat) => (
          <div key={cat} className="res-group">
            <div className="res-cat">{cat}</div>
            <div className="list">
              {res.filter((r) => r.category === cat).map((r) => {
                const Ico = RES_ICON[r.icon] || IconBook;
                return (
                  <button key={r.id} className="row" onClick={() => openArticle(r.id)}>
                    <span className="row-ico"><Ico size={18} /></span>
                    <span className="row-body">
                      <span className="row-title">{r.title}</span>
                      <span className="row-desc">{r.intro}</span>
                    </span>
                    <IconChevron size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>)}

      {tab === 'res' && article && (<section className="panel scroll">
        <div className="art-top">
          <button className="art-back" onClick={() => setArticle(null)}>‹ Ressources</button>
        </div>
        {articleLoading || article.loading ? (
          <div className="pad"><span className="dots"><i /><i /><i /></span></div>
        ) : (
          <article className="article">
            <span className="art-cat">{article.category}</span>
            <h2 className="art-title">{article.title}</h2>
            <div className="art-body" dangerouslySetInnerHTML={{ __html: article.html }} />
            {article.source && (
              <p className="art-src">Source : {article.url
                ? <a href={article.url} target="_blank" rel="noopener noreferrer">{article.source}</a>
                : article.source}</p>
            )}
            <button className="art-ask" onClick={() => { setArticle(null); setTab('chat'); push(article.ask); }}>
              <IconChat size={15} /> Poser une question à Élise sur ce sujet
            </button>
          </article>
        )}
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

    {/* Panneau historique (surtout mobile) : même liste que la sidebar */}
    {historyOpen && (
      <div className="pv-overlay" onClick={() => setHistoryOpen(false)}>
        <div className="pv-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mes conversations">
          <div className="pv-head">
            <span><IconClock size={16} /> Mes conversations</span>
            <button className="pv-x" onClick={() => setHistoryOpen(false)} aria-label="Fermer">×</button>
          </div>
          <div className="pv-sec">
            <ConvList sessions={sessions} currentId={currentId} onNew={newConversation} onLoad={loadConversation} onDelete={deleteConversation} />
            <p className="pv-hint">Ces conversations sont gardées uniquement sur cet appareil. La sortie rapide les efface toutes.</p>
          </div>
        </div>
      </div>
    )}
  </>);
}
