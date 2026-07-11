import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TerminiServizio() {
  return (
    <div className="min-h-screen bg-[var(--bg-primario)] text-[var(--testo-primario)]">
      <div className="max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] mb-8 transition-colors">
          <ArrowLeft size={16} /> Torna all'app
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-extrabold mb-2">Termini e Condizioni</h1>
          <p className="text-sm text-[var(--testo-terziario)] mb-8">Ultimo aggiornamento: 11 maggio 2026</p>

          <div className="flex flex-col gap-6 text-sm leading-relaxed text-[var(--testo-secondario)]">
            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">1. Oggetto del Servizio</h2>
              <p>GymMaster è una piattaforma web di gestione degli allenamenti in palestra che consente agli utenti di creare e seguire schede di allenamento, tracciare i progressi, comunicare con altri utenti e interagire con personal trainer.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">2. Registrazione e Account</h2>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>Per utilizzare il servizio è necessario creare un account fornendo dati veritieri e aggiornati.</li>
                <li>L'account è personale e non trasferibile.</li>
                <li>La registrazione è soggetta ad approvazione da parte dell'amministratore.</li>
                <li>L'utente è responsabile della sicurezza delle proprie credenziali di accesso.</li>
                <li>L'utente deve avere almeno 16 anni di età per registrarsi (ai sensi dell'Art. 8 GDPR).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">3. Obblighi dell'Utente</h2>
              <p>L'utente si impegna a:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>Utilizzare il servizio in modo lecito e conforme ai presenti termini</li>
                <li>Non condividere contenuti offensivi, illegali o inappropriati</li>
                <li>Non tentare di accedere ad account o dati di altri utenti</li>
                <li>Non utilizzare bot, script o strumenti automatizzati non autorizzati</li>
                <li>Non eludere le misure di sicurezza dell'applicazione</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">4. Personal Trainer</h2>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>Gli utenti possono richiedere il ruolo di Personal Trainer, soggetto ad approvazione.</li>
                <li>I Personal Trainer possono creare esercizi, gestire clienti e fissare appuntamenti.</li>
                <li>GymMaster non verifica le qualifiche professionali dei Personal Trainer e non si assume responsabilità per i loro servizi.</li>
                <li>L'utente che si iscrive a un Personal Trainer lo fa sotto la propria responsabilità.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">5. Proprietà Intellettuale</h2>
              <p>GymMaster è un progetto open-source. Il codice sorgente è disponibile su <a href="https://github.com/giosci1994/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">GitHub</a>. I contenuti creati dagli utenti (schede, esercizi personalizzati) rimangono di proprietà dei rispettivi autori.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">6. Disclaimer Medico</h2>
              <p className="font-semibold text-[var(--pericolo)]">GymMaster non fornisce consulenza medica. L'applicazione è uno strumento di monitoraggio degli allenamenti e non sostituisce il parere di un medico o di un professionista sanitario. Consulta sempre un medico prima di iniziare un nuovo programma di allenamento.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">7. Limitazione di Responsabilità</h2>
              <p>Il servizio è fornito "così com'è" senza garanzie di alcun tipo. Il titolare non è responsabile per:</p>
              <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
                <li>Interruzioni temporanee del servizio</li>
                <li>Perdita di dati dovuta a cause di forza maggiore</li>
                <li>Danni derivanti dall'uso improprio dell'applicazione</li>
                <li>Infortuni o danni fisici derivanti dagli allenamenti</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">8. Sospensione e Cancellazione</h2>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                <li>L'amministratore può sospendere o bannare account che violano i presenti termini.</li>
                <li>L'utente può richiedere la cancellazione del proprio account e dei relativi dati in qualsiasi momento.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">9. Modifiche ai Termini</h2>
              <p>Ci riserviamo il diritto di modificare i presenti termini. Le modifiche verranno comunicate tramite l'applicazione. L'uso continuato del servizio dopo la notifica costituisce accettazione dei nuovi termini.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[var(--testo-primario)] mb-2">10. Legge Applicabile</h2>
              <p>I presenti termini sono regolati dalla normativa dell'Unione Europea, in particolare dal Regolamento UE 2016/679 (GDPR). Per qualsiasi controversia sarà competente il foro del luogo di residenza dell'utente consumatore, in conformità con il Regolamento UE n. 1215/2012.</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
