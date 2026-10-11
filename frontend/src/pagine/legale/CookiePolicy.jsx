import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import Testo from '../../i18n/Testo.jsx';

const GRASSETTO = { b: <strong /> };

export default function CookiePolicy() {
  const { t } = useLingua();
  return (
    <div className="min-h-screen bg-[var(--bg-primario)] text-[var(--testo-primario)]">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-8 transition-colors">
          <ArrowLeft size={16} /> {t('cookiePolicy.tornaApp')}
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-extrabold mb-2">{t('cookiePolicy.titolo')}</h1>
          <p className="text-sm text-[var(--testo-terziario)] mb-8">{t('cookiePolicy.ultimoAggiornamento')}</p>

          <div className="flex flex-col gap-6 text-sm leading-relaxed text-[var(--testo-secondario)]">
            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('cookiePolicy.cosaSono.titolo')}</h2>
              <p>{t('cookiePolicy.cosaSono.testo')}</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('cookiePolicy.utilizzati.titolo')}</h2>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--bordo)]">
                      <th className="text-left py-2 pr-3 font-semibold text-[var(--testo-primario)]">{t('cookiePolicy.utilizzati.colonnaNome')}</th>
                      <th className="text-left py-2 pr-3 font-semibold text-[var(--testo-primario)]">{t('cookiePolicy.utilizzati.colonnaTipo')}</th>
                      <th className="text-left py-2 pr-3 font-semibold text-[var(--testo-primario)]">{t('cookiePolicy.utilizzati.colonnaFinalita')}</th>
                      <th className="text-left py-2 font-semibold text-[var(--testo-primario)]">{t('cookiePolicy.utilizzati.colonnaDurata')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[var(--bordo)]">
                      <td className="py-2 pr-3 font-mono">refreshToken</td>
                      <td className="py-2 pr-3">{t('cookiePolicy.utilizzati.tipoNecessario')}</td>
                      <td className="py-2 pr-3">{t('cookiePolicy.utilizzati.refreshToken.finalita')}</td>
                      <td className="py-2">{t('cookiePolicy.utilizzati.refreshToken.durata')}</td>
                    </tr>
                    <tr className="border-b border-[var(--bordo)]">
                      <td className="py-2 pr-3 font-mono">cookieConsent</td>
                      <td className="py-2 pr-3">{t('cookiePolicy.utilizzati.tipoNecessario')}</td>
                      <td className="py-2 pr-3">{t('cookiePolicy.utilizzati.cookieConsent.finalita')}</td>
                      <td className="py-2">{t('cookiePolicy.utilizzati.cookieConsent.durata')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('cookiePolicy.terzeParti.titolo')}</h2>
              <p><Testo t="cookiePolicy.terzeParti.testo" componenti={GRASSETTO} /></p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('cookiePolicy.gestione.titolo')}</h2>
              <p>{t('cookiePolicy.gestione.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>{t('cookiePolicy.gestione.banner')}</li>
                <li>{t('cookiePolicy.gestione.browser')}</li>
                <li>{t('cookiePolicy.gestione.cancellazione')}</li>
              </ul>
              <p className="mt-2"><Testo t="cookiePolicy.gestione.nota" componenti={GRASSETTO} /></p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('cookiePolicy.baseGiuridica.titolo')}</h2>
              <p>{t('cookiePolicy.baseGiuridica.testo')}</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
