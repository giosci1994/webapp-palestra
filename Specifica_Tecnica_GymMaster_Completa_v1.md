# Specifica Tecnica Architetturale: GymMaster PWA (Self-Hosted, Social & Analytics)

## 1. Visione Generale del Progetto
**Obiettivo:** Sviluppare un'applicazione web PWA (Progressive Web App) multi-utente, ospitata autonomamente (Self-Hosted tramite Docker), dedicata alla pianificazione, tracciamento e analisi degli allenamenti in palestra.
**Concept:** Il sistema si divide in due flussi di utilizzo:
- **La Regia (PC/Tablet):** Per la creazione di schede, analisi dei dati e gestione del profilo.
- **L'Azione (Mobile):** Un'interfaccia ultra-ottimizzata per l'uso sotto sforzo in palestra, con tracking offline-first e timer automatici.

---

## 2. Stack Tecnologico & Architettura
- **Frontend (PWA):** React.js (tramite Vite) + Tailwind CSS per lo styling + Recharts/Chart.js per la visualizzazione dati + Framer Motion per le animazioni.
- **Backend (API API):** Node.js con Express.js. Architettura modulare basata su ruoli (RBAC).
- **Database:** PostgreSQL (gestito preferibilmente tramite ORM come Prisma).
- **Infrastruttura:** Docker & Docker Compose per un deploy rapido su server locali (es. Mini PC).

---

## 3. Schema del Database Completo (Modello Relazionale)

### A. Utenti, Ruoli e Gamification
- **Utenti:** `id`, `email`, `password_hash`, `nome`, `ruolo` (ENUM: 'USER', 'SUPERADMIN'), `palestra_id` (FK), `stato`, `punti_esperienza`, `data_registrazione`.
- **Record_Personali (PR):** `id`, `utente_id`, `esercizio_id`, `peso_max_raggiunto`, `data_record`.

### B. Ecosistema Palestre ed Attrezzatura
- **Palestre_Catene:** `id`, `nome_catena` (es. Virgin, PureGym, SATS), `citta`, `indirizzo`.
- **Attrezzatura_Catalogo:** `id`, `nome`, `categoria` (ENUM: 'CARDIO', 'PESI_LIBERI', 'MACCHINE', 'CAVI'), `muscoli_bersaglio`.
- **Palestra_Attrezzatura:** Tabella pivot molti-a-molti (`palestra_id`, `attrezzatura_id`).

### C. Allenamento: Libreria e Schede
- **Esercizi:** `id`, `nome`, `gruppo_muscolare_primario`, `gruppo_muscolare_secondario`, `attrezzatura_richiesta_id` (FK), `descrizione`, `link_video`.
- **Schede_Allenamento:** `id`, `creatore_id` (FK), `titolo`, `descrizione`, `livello` (BASE, INTERMEDIO, AVANZATO), `visibilita` (GLOBALE, PERSONALE).
- **Esercizi_Scheda (Il Template):** `id`, `scheda_id`, `esercizio_id`, `serie_target`, `rep_target`, `recupero_secondi`, `ordine_esecuzione`.

### D. Tracking: Sessioni e Log Reali
- **Sessioni_Allenamento (Log Generale):** `id`, `utente_id`, `scheda_id`, `data_inizio`, `data_fine`, `durata_minuti`, `minuti_riscaldamento`, `volume_totale_kg`, `note_finali`.
- **Log_Serie (Dettaglio Sforzo):** `id`, `sessione_id`, `esercizio_id`, `serie_numero`, `peso_effettivo`, `rep_effettive`, `rpe` (Rate of Perceived Exertion 1-10), `completato` (Booleano), `motivo_salto_esercizio`, `note_serie`.

---

## 4. Funzzionalità Core & Interfaccia Utente

### A. Dashboard di Amministrazione (Superadmin)
- Controllo totale degli utenti registrati sul server (approvazione/ban).
- Gestione del database Palestre ed Attrezzature.
- Creazione di **Schede Globali** pronte all'uso per i nuovi iscritti (es. "Total Body Principianti").

### B. Interfaccia "Regia" (Desktop)
- **Generatore di Schede:** Interfaccia drag-and-drop o a lista per creare allenamenti personalizzati basati sull'attrezzatura disponibile nella propria palestra.
- **Filtro Attrezzatura Intelligente:** Se un utente è assegnato alla palestra "PureGym Milano", il sistema gli propone prioritariamente esercizi compatibili con i macchinari di quella sede.

### C. Interfaccia "Azione" (Mobile PWA)
- **Design Ottimizzato:** Modalità Scura forzata, font ad alta leggibilità, e zone di tocco (bottoni) enormi per facilitare l'uso con le mani sudate.
- **Screen Wake Lock API:** Lo schermo rimane forzatamente acceso durante il workout, per evitare blocchi tra una serie e l'altra.
- **Timer Automatico:** Alla conferma di una serie, parte un countdown visivo per il recupero, con notifica acustica al termine.
- **Sostituzione al Volo:** Bottone "Macchinario Occupato" per rimpiazzare istantaneamente un esercizio con una variante che colpisce lo stesso muscolo (es. Panca Piana -> Croci ai Cavi).
- **Resilienza Offline:** Salva i log temporaneamente in IndexedDB (browser locale) per resistere alle disconnessioni tipiche delle sale pesi.

---

## 5. Moduli Avanzati: Statistiche, AI & Gamification

### A. Analytics & Dashboard Personale
- Grafici basati su Recharts/Chart.js.
- **Mappa del Corpo (Radar Chart):** Mostra la distribuzione del volume totale di allenamento per gruppo muscolare (per identificare squilibri, es. poco allenamento sulle gambe).
- **Trend di Durata & Volume:** Grafici storici per analizzare se il tonnellaggio sollevato cresce nel tempo.

### B. Assistente Virtuale (Regole Logiche)
- Fornisce suggerimenti automatici basati sui log del mese:
  - *Squilibri:* "Hai trascurato i femorali questa settimana, aggiungi un Leg Curl."
  - *Progressione:* "Hai completato facilmente i 100kg di Panca (RPE 6), prova ad aumentare di 2.5kg."

### C. Social & Competizione (Gamification)
- **Leaderboards Locali:** Classifiche tra gli utenti del server basate su Costanza (n. allenamenti) e Volume Settimanale.
- **Celebrazione Record Personali (PR):** Quando viene loggato un peso mai sollevato prima, l'app mobile attiva un'animazione di celebrazione (coriandoli/badge) e salva il record.

---

## 6. Deployment & Configurazione (Docker)
- Creare un file `docker-compose.yml` che esponga il Frontend sulla porta `80/443` e il backend API, con persistenza dati per PostgreSQL su volumi locali.
- Creare uno script `seed.js` per popolare inizialmente il DB con il ruolo Superadmin, un set base di attrezzature (es. Bilancieri, Manubri) e catene di palestre famose.

---

## 7. Prompt di Sviluppo (Istruzioni per l'IA Generativa)

Copia e incolla il testo seguente all'IA designata per la scrittura del codice:

> "Agisci come un Senior Full-Stack Engineer. Sviluppa il progetto 'GymMaster' basandoti rigidamente su questa specifica tecnica.
> 
> **Regole di Ingegneria:**
> 1. Scrivi tutto il codice, i commenti, i nomi delle variabili e l'Interfaccia Utente rigorosamente in **Italiano**.
> 2. Assicurati che l'architettura sia modulare (cartelle separate per controllers, services, routes, components).
> 3. Il frontend Mobile deve implementare la Screen Wake Lock API e un design a 'pulsanti giganti'.
> 4. Per il Database, usa PostgreSQL tramite l'ORM Prisma per facilitare le relazioni complesse tra Palestre, Esercizi e Utenti.
> 
> **Fase 1 (Task attuale):**
> Genera il file `docker-compose.yml` per l'ambiente, il file `schema.prisma` completo di tutti i modelli descritti nella specifica, e uno script di seeding iniziale. Non procedere alla Fase 2 finché non confermo che il database è corretto."
