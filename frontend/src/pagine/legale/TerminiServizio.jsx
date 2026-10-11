import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';
import Testo from '../../i18n/Testo.jsx';

export default function TerminiServizio() {
  const { t } = useLingua();
  return (
    <div className="min-h-screen bg-[var(--bg-primario)] text-[var(--testo-primario)]">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-8 transition-colors">
          <ArrowLeft size={16} /> {t('terminiServizio.tornaApp')}
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-extrabold mb-2">{t('terminiServizio.titolo')}</h1>
          <p className="text-sm text-[var(--testo-terziario)] mb-8">{t('terminiServizio.ultimoAggiornamento')}</p>

          <div className="flex flex-col gap-6 text-sm leading-relaxed text-[var(--testo-secondario)]">
            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.oggetto.titolo')}</h2>
              <p>{t('terminiServizio.oggetto.testo')}</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.registrazione.titolo')}</h2>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>{t('terminiServizio.registrazione.datiVeritieri')}</li>
                <li>{t('terminiServizio.registrazione.personale')}</li>
                <li>{t('terminiServizio.registrazione.approvazione')}</li>
                <li>{t('terminiServizio.registrazione.credenziali')}</li>
                <li>{t('terminiServizio.registrazione.eta')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.obblighi.titolo')}</h2>
              <p>{t('terminiServizio.obblighi.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>{t('terminiServizio.obblighi.lecito')}</li>
                <li>{t('terminiServizio.obblighi.contenuti')}</li>
                <li>{t('terminiServizio.obblighi.accessi')}</li>
                <li>{t('terminiServizio.obblighi.automatismi')}</li>
                <li>{t('terminiServizio.obblighi.sicurezza')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.personalTrainer.titolo')}</h2>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>{t('terminiServizio.personalTrainer.ruolo')}</li>
                <li>{t('terminiServizio.personalTrainer.attivita')}</li>
                <li>{t('terminiServizio.personalTrainer.qualifiche')}</li>
                <li>{t('terminiServizio.personalTrainer.responsabilita')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.proprietaIntellettuale.titolo')}</h2>
              <p><Testo t="terminiServizio.proprietaIntellettuale.testo" componenti={{ link: <a href="https://github.com/giosci1994/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline" /> }} /></p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.disclaimerMedico.titolo')}</h2>
              <p className="font-semibold text-[var(--pericolo)]">{t('terminiServizio.disclaimerMedico.testo')}</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.responsabilita.titolo')}</h2>
              <p>{t('terminiServizio.responsabilita.intro')}</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>{t('terminiServizio.responsabilita.interruzioni')}</li>
                <li>{t('terminiServizio.responsabilita.perditaDati')}</li>
                <li>{t('terminiServizio.responsabilita.usoImproprio')}</li>
                <li>{t('terminiServizio.responsabilita.infortuni')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.sospensione.titolo')}</h2>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>{t('terminiServizio.sospensione.ban')}</li>
                <li>{t('terminiServizio.sospensione.cancellazione')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.modifiche.titolo')}</h2>
              <p>{t('terminiServizio.modifiche.testo')}</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">{t('terminiServizio.leggeApplicabile.titolo')}</h2>
              <p>{t('terminiServizio.leggeApplicabile.testo')}</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
