import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primario)] text-[var(--testo-primario)]">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-8 transition-colors">
          <ArrowLeft size={16} /> Torna all'app
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-extrabold mb-2">Cookie Policy</h1>
          <p className="text-sm text-[var(--testo-terziario)] mb-8">Ultimo aggiornamento: 11 maggio 2026</p>

          <div className="flex flex-col gap-6 text-sm leading-relaxed text-[var(--testo-secondario)]">
            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">1. Cosa sono i Cookie</h2>
              <p>I cookie sono piccoli file di testo che vengono memorizzati sul tuo dispositivo quando visiti un sito web. Servono a migliorare l'esperienza di navigazione e a garantire il funzionamento di alcune funzionalità.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">2. Cookie Utilizzati</h2>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--bordo)]">
                      <th className="text-left py-2 pr-3 font-semibold text-[var(--testo-primario)]">Nome</th>
                      <th className="text-left py-2 pr-3 font-semibold text-[var(--testo-primario)]">Tipo</th>
                      <th className="text-left py-2 pr-3 font-semibold text-[var(--testo-primario)]">Finalità</th>
                      <th className="text-left py-2 font-semibold text-[var(--testo-primario)]">Durata</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[var(--bordo)]">
                      <td className="py-2 pr-3 font-mono">refreshToken</td>
                      <td className="py-2 pr-3">Necessario</td>
                      <td className="py-2 pr-3">Autenticazione — mantiene la sessione utente</td>
                      <td className="py-2">7 giorni</td>
                    </tr>
                    <tr className="border-b border-[var(--bordo)]">
                      <td className="py-2 pr-3 font-mono">cookieConsent</td>
                      <td className="py-2 pr-3">Necessario</td>
                      <td className="py-2 pr-3">Memorizza le preferenze cookie dell'utente</td>
                      <td className="py-2">1 anno</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">3. Cookie di Terze Parti</h2>
              <p>GymMaster <strong>non utilizza</strong> cookie di profilazione, tracking o di terze parti. Non utilizziamo Google Analytics, Facebook Pixel o altri servizi di tracciamento.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">4. Come Gestire i Cookie</h2>
              <p>Puoi gestire le preferenze dei cookie in qualsiasi momento:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>Tramite il banner cookie presente nell'applicazione</li>
                <li>Modificando le impostazioni del tuo browser</li>
                <li>Cancellando i cookie memorizzati dal browser</li>
              </ul>
              <p className="mt-2"><strong>Nota:</strong> la disabilitazione dei cookie necessari potrebbe compromettere il funzionamento dell'applicazione (ad esempio, non sarà possibile mantenere la sessione di login).</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">5. Base Giuridica</h2>
              <p>I cookie strettamente necessari sono trattati sulla base dell'interesse legittimo (Art. 6(1)(f) GDPR). Per eventuali cookie non essenziali, verrà richiesto il consenso esplicito dell'utente (Art. 6(1)(a) GDPR).</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
