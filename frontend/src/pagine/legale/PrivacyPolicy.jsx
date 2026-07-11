import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primario)] text-[var(--testo-primario)]">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-8 transition-colors">
          <ArrowLeft size={16} /> Torna all'app
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-extrabold mb-2">Informativa sulla Privacy</h1>
          <p className="text-sm text-[var(--testo-terziario)] mb-8">Ultimo aggiornamento: 11 maggio 2026</p>

          <div className="prose-custom flex flex-col gap-6 text-sm leading-relaxed text-[var(--testo-secondario)]">
            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">1. Titolare del Trattamento</h2>
              <p>Giovanni — Progetto open-source GymMaster<br />
                Contatto: <a href="https://github.com/giosci1994/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">github.com/giosci1994</a>
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">2. Dati Raccolti</h2>
              <p>Raccogliamo le seguenti categorie di dati personali:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li><strong>Dati di registrazione:</strong> nome, indirizzo email, password (hash crittografico)</li>
                <li><strong>Dati del profilo:</strong> foto profilo, data di nascita, sesso, peso, altezza, obiettivo fitness</li>
                <li><strong>Dati di allenamento:</strong> sessioni, esercizi, serie, ripetizioni, carichi, record personali</li>
                <li><strong>Dati tecnici:</strong> indirizzo IP, tipo di browser, cookie tecnici di sessione</li>
                <li><strong>Dati di comunicazione:</strong> messaggi nella chat interna</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">3. Base Giuridica e Finalità</h2>
              <p>Il trattamento dei dati è basato su:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li><strong>Consenso (Art. 6(1)(a) GDPR):</strong> per funzionalità opzionali come gamification, visibilità profilo, statistiche condivise</li>
                <li><strong>Esecuzione del contratto (Art. 6(1)(b) GDPR):</strong> per l'erogazione del servizio (gestione account, allenamenti, comunicazioni)</li>
                <li><strong>Interesse legittimo (Art. 6(1)(f) GDPR):</strong> per sicurezza, prevenzione abusi, miglioramento del servizio</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">4. Conservazione dei Dati</h2>
              <p>I dati personali vengono conservati per la durata necessaria alle finalità per cui sono stati raccolti:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>Dati account: fino alla cancellazione dell'account</li>
                <li>Dati di allenamento: fino alla cancellazione dell'account o su richiesta</li>
                <li>Messaggi chat: secondo le impostazioni di retention configurate dall'utente (default: 7 giorni)</li>
                <li>Log tecnici: massimo 90 giorni</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">5. Diritti dell'Utente</h2>
              <p>Ai sensi del Regolamento UE 2016/679 (GDPR), hai il diritto di:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li><strong>Accesso:</strong> ottenere conferma del trattamento e copia dei tuoi dati</li>
                <li><strong>Rettifica:</strong> correggere dati inesatti o incompleti</li>
                <li><strong>Cancellazione:</strong> richiedere la cancellazione dei tuoi dati ("diritto all'oblio")</li>
                <li><strong>Limitazione:</strong> limitare il trattamento in determinate circostanze</li>
                <li><strong>Portabilità:</strong> ricevere i tuoi dati in formato strutturato e leggibile</li>
                <li><strong>Opposizione:</strong> opporti al trattamento basato su interesse legittimo</li>
                <li><strong>Revoca del consenso:</strong> revocare il consenso in qualsiasi momento</li>
              </ul>
              <p className="mt-2">Per esercitare i tuoi diritti, contattaci tramite il profilo GitHub sopra indicato.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">6. Sicurezza</h2>
              <p>Implementiamo misure tecniche e organizzative adeguate per proteggere i tuoi dati:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>Crittografia delle password con Argon2id</li>
                <li>Connessioni HTTPS criptate</li>
                <li>Token JWT con rotazione automatica</li>
                <li>Rate limiting e protezione anti-brute-force</li>
                <li>Helmet.js per la protezione degli header HTTP</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">7. Trasferimento Dati</h2>
              <p>I dati sono archiviati su server self-hosted nell'Unione Europea. Non trasferiamo dati personali verso paesi terzi al di fuori dello Spazio Economico Europeo (SEE).</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">8. Modifiche</h2>
              <p>Ci riserviamo il diritto di aggiornare questa informativa. Le modifiche saranno comunicate tramite l'applicazione. L'uso continuato del servizio dopo la notifica costituisce accettazione delle modifiche.</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
