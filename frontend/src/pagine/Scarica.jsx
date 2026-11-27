// ============================================
// GymMaster — Download the app (public page /scarica)
// ============================================
//
// The way to install the app on the device the page is opened on, chosen
// from the system it detects (utils/scarica.js); the selector shows the
// others. Android and Windows download the latest release from GitHub,
// iPhone and iPad add the web app from Safari, any other browser installs the
// web app (beforeinstallprompt, where the browser offers it).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CircleCheck, Download, Globe, Monitor, Smartphone, TabletSmartphone } from 'lucide-react';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';
import { LINK_DOWNLOAD, PIATTAFORME, apertaNellApp, rilevaPiattaforma } from '../utils/scarica.js';

const ICONE = { android: Smartphone, ios: TabletSmartphone, windows: Monitor, altro: Globe };

// The steps of each system, in the order they are done
const PASSI = {
  android: ['scarica.android.passo1', 'scarica.android.passo2', 'scarica.android.passo3'],
  ios: ['scarica.ios.passo1', 'scarica.ios.passo2', 'scarica.ios.passo3'],
  windows: ['scarica.windows.passo1', 'scarica.windows.passo2', 'scarica.windows.passo3'],
  altro: ['scarica.altro.passo1', 'scarica.altro.passo2']
};

const GRASSETTO = { b: <b className="text-[var(--testo-primario)]" /> };

const SFONDO = {
  background: 'linear-gradient(135deg, var(--bg-primario) 0%, var(--bg-secondario) 40%, var(--bg-quaternario) 100%)',
  paddingTop: 'calc(16px + var(--safe-top))',
  paddingBottom: 'calc(24px + var(--safe-bottom))',
  paddingLeft: 'calc(16px + var(--safe-left))',
  paddingRight: 'calc(16px + var(--safe-right))'
};

/** The browser's own "install the web app" prompt, when it offers one. */
function useInstallazioneWebApp() {
  const [richiesta, setRichiesta] = useState(null);
  useEffect(() => {
    const offerta = evento => {
      evento.preventDefault();
      setRichiesta(evento);
    };
    const installata = () => setRichiesta(null);
    window.addEventListener('beforeinstallprompt', offerta);
    window.addEventListener('appinstalled', installata);
    return () => {
      window.removeEventListener('beforeinstallprompt', offerta);
      window.removeEventListener('appinstalled', installata);
    };
  }, []);
  const installa = async () => {
    if (!richiesta) return;
    richiesta.prompt();
    await richiesta.userChoice.catch(() => {});
    setRichiesta(null);
  };
  return { disponibile: !!richiesta, installa };
}

function Passi({ chiavi }) {
  return (
    <ol className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--testo-secondario)]">
      {chiavi.map((chiave, i) => (
        <li key={chiave} className="flex gap-3">
          <span className="flex-none w-6 h-6 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-xs font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <span className="pt-0.5"><Testo t={chiave} componenti={GRASSETTO} /></span>
        </li>
      ))}
    </ol>
  );
}

export default function Scarica() {
  const { t } = useLingua();
  const [rilevata] = useState(() => rilevaPiattaforma());
  const [scelta, setScelta] = useState(rilevata);
  const [nellApp] = useState(() => apertaNellApp());
  const webApp = useInstallazioneWebApp();

  const download = LINK_DOWNLOAD[scelta];
  const Icona = ICONE[scelta];

  return (
    <div className="min-h-screen flex justify-center text-[var(--testo-primario)]" style={SFONDO}>
      <div className="w-full max-w-lg">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-6 transition-colors">
          <ArrowLeft size={16} /> {t('scarica.tornaApp')}
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
          <header className="text-center">
            <img src="/icons/icon-192.png" alt="" width="72" height="72" className="mx-auto mb-4 rounded-2xl shadow-lg" />
            <h1 className="text-3xl font-extrabold testo-gradient">{t('scarica.titolo')}</h1>
            <p className="text-[var(--testo-secondario)] mt-2 text-sm">{t('scarica.sottotitolo')}</p>
          </header>

          {nellApp && (
            <div className="glass-card p-4 flex items-center gap-3 text-sm" role="status">
              <CircleCheck size={20} className="flex-none text-[var(--successo)]" />
              <span>{t('scarica.giaInstallata')}</span>
            </div>
          )}

          <div role="radiogroup" aria-label={t('scarica.scegliSistema')} className="grid grid-cols-4 gap-2">
            {PIATTAFORME.map(piattaforma => {
              const IconaScelta = ICONE[piattaforma];
              const attiva = piattaforma === scelta;
              return (
                <button key={piattaforma} type="button" role="radio" aria-checked={attiva}
                        onClick={() => setScelta(piattaforma)}
                        className={`glass-card flex flex-col items-center gap-1.5 px-1 py-3 text-xs font-semibold transition-colors ${
                          attiva ? 'text-[var(--accent)]' : 'text-[var(--testo-secondario)]'}`}
                        style={attiva ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}>
                  <IconaScelta size={22} />
                  <span className="text-center leading-tight">{t(`scarica.piattaforma.${piattaforma}`)}</span>
                </button>
              );
            })}
          </div>

          <section className="glass-card p-card-inner flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="flex-none w-11 h-11 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
                <Icona size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold">{t(`scarica.${scelta}.titolo`)}</h2>
                <p className="text-sm text-[var(--testo-secondario)] mt-0.5">{t(`scarica.${scelta}.descrizione`)}</p>
                {scelta === rilevata && rilevata !== 'altro' && (
                  <span className="badge accent mt-2">{t('scarica.rilevato')}</span>
                )}
              </div>
            </div>

            {download && (
              <a href={download} className="btn-primario w-full" rel="noopener">
                <Download size={18} /> {t(`scarica.${scelta}.scarica`)}
              </a>
            )}

            <Passi chiavi={PASSI[scelta]} />

            {scelta === 'ios' && (
              <p className="text-xs text-[var(--testo-terziario)]">{t('scarica.ios.notifiche')}</p>
            )}

            {scelta === 'altro' && webApp.disponibile && (
              <button type="button" onClick={webApp.installa} className="btn-primario w-full">
                <Download size={18} /> {t('scarica.installa')}
              </button>
            )}
          </section>

          {download && (
            <section className="glass-card p-4 flex flex-col gap-3 text-sm">
              <h3 className="font-semibold">{t('scarica.webApp.titolo')}</h3>
              <p className="text-[var(--testo-secondario)]"><Testo t={`scarica.webApp.${scelta}`} componenti={GRASSETTO} /></p>
              {webApp.disponibile && (
                <button type="button" onClick={webApp.installa} className="btn-secondario w-full" style={{ padding: '10px 20px' }}>
                  {t('scarica.installa')}
                </button>
              )}
            </section>
          )}

          {download && (
            <p className="text-center text-xs text-[var(--testo-terziario)]">{t('scarica.versioneRelease')}</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
