import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import Testo from '../../i18n/Testo.jsx';

const GRASSETTO = { b: <strong /> };

export default function PrivacyPolicy() {
  const { t } = useLingua();
  return (
    <div className="min-h-screen bg-[var(--bg-primario)] text-[var(--testo-primario)]">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-8 transition-colors">
          <ArrowLeft size={16} /> {t('privacyPolicy.tornaApp')}
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-extrabold mb-2">{t('privacyPolicy.titolo')}</h1>
          <p className="text-sm text-[var(--testo-terziario)] mb-8">{t('privacyPolicy.ultimoAggiornamento')}</p>

          <div className="prose-custom flex flex-col gap-6 text-sm leading-relaxed text-[var(--testo-secondario)]">
            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.titolare.titolo')}</h2>
              <p>{t('privacyPolicy.titolare.nome')}<br />
                <Testo t="privacyPolicy.titolare.contatto" componenti={{ link: <a href="https://github.com/giosci1994/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline" /> }} />
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.datiRaccolti.titolo')}</h2>
              <p>{t('privacyPolicy.datiRaccolti.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li><Testo t="privacyPolicy.datiRaccolti.registrazione" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.datiRaccolti.profilo" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.datiRaccolti.allenamento" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.datiRaccolti.tecnici" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.datiRaccolti.comunicazione" componenti={GRASSETTO} /></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.baseGiuridica.titolo')}</h2>
              <p>{t('privacyPolicy.baseGiuridica.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li><Testo t="privacyPolicy.baseGiuridica.consenso" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.baseGiuridica.contratto" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.baseGiuridica.interesse" componenti={GRASSETTO} /></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.conservazione.titolo')}</h2>
              <p>{t('privacyPolicy.conservazione.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>{t('privacyPolicy.conservazione.account')}</li>
                <li>{t('privacyPolicy.conservazione.allenamento')}</li>
                <li>{t('privacyPolicy.conservazione.chat')}</li>
                <li>{t('privacyPolicy.conservazione.log')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.diritti.titolo')}</h2>
              <p>{t('privacyPolicy.diritti.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li><Testo t="privacyPolicy.diritti.accesso" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.diritti.rettifica" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.diritti.cancellazione" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.diritti.limitazione" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.diritti.portabilita" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.diritti.opposizione" componenti={GRASSETTO} /></li>
                <li><Testo t="privacyPolicy.diritti.revoca" componenti={GRASSETTO} /></li>
              </ul>
              <p className="mt-2"><Testo t="privacyPolicy.diritti.esercizio" componenti={GRASSETTO} /></p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.sicurezza.titolo')}</h2>
              <p>{t('privacyPolicy.sicurezza.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>{t('privacyPolicy.sicurezza.password')}</li>
                <li>{t('privacyPolicy.sicurezza.https')}</li>
                <li>{t('privacyPolicy.sicurezza.jwt')}</li>
                <li>{t('privacyPolicy.sicurezza.rateLimiting')}</li>
                <li>{t('privacyPolicy.sicurezza.helmet')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.trasferimento.titolo')}</h2>
              <p>{t('privacyPolicy.trasferimento.testo')}</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('privacyPolicy.modifiche.titolo')}</h2>
              <p>{t('privacyPolicy.modifiche.testo')}</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
