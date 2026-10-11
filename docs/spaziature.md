# Documentazione Tecnica: Sistema di Spaziature, Margini e Safe Areas Mobile

Questa documentazione descrive le linee guida e le specifiche tecniche utilizzate per implementare il sistema di spaziatura, padding e gestione delle Safe Areas su tutte le pagine dell'applicazione GymMaster.

---

## 1. Linee Guida per il Design delle Card (.glass-card)

Per prevenire che elementi interni come testo, icone, bottoni o hover background vengano tagliati o si posizionino troppo vicini ai bordi delle card arrotondate (`border-radius: 12px` di `.glass-card`), sono state stabilite le seguenti classi standard:

### Contenitori Completi (`p-card-inner`)
- **Descrizione**: Applica 24px (`1.5rem`) di padding su tutti e quattro i lati della card.
- **Utilizzo**: Form di creazione, card singole di anteprima (es. schede, palestre, record, statistiche).
- **CSS**: `.p-card-inner { padding: 24px; }`

### Allineamento Orizzontale (`px-card-inner`)
- **Descrizione**: Applica 24px (`1.5rem`) di padding sui lati sinistro e destro.
- **Utilizzo**: Elementi di liste interne a filo delle card (dove l'hover background deve coprire tutta la larghezza orizzontale) e header cliccabili.
- **CSS**: `.px-card-inner { padding-left: 24px; padding-right: 24px; }`

### Spaziatura Liste Interne a Filo delle Card
- **Elementi intermedi**: Devono utilizzare `px-card-inner py-5` per garantire 24px laterali e 20px verticali.
- **Ultimo elemento**: Deve allontanarsi dal bordo arrotondato inferiore e rispettarne la curvatura per gli effetti hover. Utilizzare la seguente classe combinata:
  `px-card-inner pt-5 pb-7 rounded-b-[var(--raggio-md)]`

---

## 2. Gestione delle Safe Areas su Dispositivi Mobili (PWA)

Con l'attivazione di `viewport-fit=cover`, la web-app occupa l'intera superficie fisica dello schermo, comprese le zone sotto la barra di stato (notch/isola) e la barra inferiore dei gesti di navigazione (su Samsung S23 Ultra e iPhone). 

### Layout Autenticato Principale
Nel file [LayoutAutenticato.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/componenti/layout/LayoutAutenticato.jsx), il contenitore principale applica dinamicamente le safe area in modo da evitare sovrapposizioni:
- **Top**: `calc(24px + var(--safe-top))` (solleva il titolo o l'header principale al di sotto dello status bar).
- **Bottom**: `calc(24px + var(--safe-bottom))` (solleva i contenuti per evitare la collisione con la barra gesti e con la Bottom Navigation mobile).
- **Left / Right**: `calc(clamp(16px, 4vw, 32px) + var(--safe-left))` (garantisce margini corretti anche in landscape).

### Chat Singola (Conversazione)
Per permettere alle bolle di chat di scorrere a tutto schermo ma mantenere l'header e l'input bar in zone sicure:
- **Header**: `paddingTop: 'calc(16px + var(--safe-top))'`
- **Input Bar**: `paddingBottom: 'calc(16px + var(--safe-bottom))'`

### Assistente AI (GymBot)
- **Barra Input Inferiore**: Aggiornata a `px-card-inner pt-3 pb-[calc(12px+var(--safe-bottom))]` per distanziare l'area di inserimento testo dal bordo inferiore dello smartphone.

---

## 3. Riepilogo dei File Modificati e Standardizzati

| Pagina / Componente | File Sorgente | Modifica di Spaziatura |
| :--- | :--- | :--- |
| **Gestione Schede** | [SchedeAllenamento.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/SchedeAllenamento.jsx) | Card della lista aggiornate a `p-card-inner`. |
| **Dettaglio Scheda** | [DettaglioScheda.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/DettaglioScheda.jsx) | Header a `p-card-inner`, esercizi a `px-card-inner py-4`. |
| **Storico Allenamenti** | [StoricoAllenamenti.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/StoricoAllenamenti.jsx) | Card sessioni a `p-card-inner`, KPI a `p-3`, Drawer a `px-card-inner py-5`, righe serie a `py-2.5`. |
| **Catalogo Esercizi** | [CatalogoEsercizi.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/CatalogoEsercizi.jsx) | Header card a `px-card-inner py-4`, espanso a `px-card-inner pb-5 pt-2`. |
| **Admin Esercizi** | [AdminEsercizi.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/AdminEsercizi.jsx) | Suggerimenti a `px-card-inner py-4`, form a `p-card-inner`, lista a `px-card-inner py-3`. |
| **Admin Palestre** | [AdminPalestre.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/AdminPalestre.jsx) | Form e card palestre a `p-card-inner`. |
| **Admin Utenti** | [AdminUtenti.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/AdminUtenti.jsx) | Alert banner a `p-card-inner`, card utente a `px-card-inner py-4`. |
| **Allenamento** | [Allenamento.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Allenamento.jsx) | Card desktop a `p-card-inner`, popup conferma a `p-card-inner`. |
| **Assistente AI** | [Assistente.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Assistente.jsx) | Header a `px-card-inner py-4`, suggerimenti a `px-card-inner py-3`, input a `px-card-inner pt-3 pb-[calc(12px+var(--safe-bottom))]`. |
| **Chat** | [Chat.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Chat.jsx) | Modale a `p-card-inner`, conversazioni/richieste lista a `px-card-inner py-4`. |
| **Gamification** | [Gamification.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Gamification.jsx) | Hero card a `p-card-inner`, leaderboard a `px-card-inner py-3`, record a `px-card-inner py-4`/`px-card-inner py-3`. |
| **Statistiche** | [Statistiche.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Statistiche.jsx) | KPI e grafici a `p-card-inner`, record recenti a `px-card-inner py-2.5`. |
| **Profilo Utente** | [Profilo.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Profilo.jsx) | Hero card e card di tutte le tab a `p-card-inner`. Liste ed info a `px-card-inner py-3` / `px-card-inner py-4`. |
| **Login / Registrazione** | [Login.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Login.jsx) / [Registrazione.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Registrazione.jsx) | Form principale e card di successo impostati a `p-card-inner`. |
| **Onboarding** | [Onboarding.jsx](file:///p:/home/pi/Web-App%20Palestra/frontend/src/pagine/Onboarding.jsx) | Wizard header a `px-card-inner pt-5 pb-0`, step corpo a `px-card-inner pb-2`, errore a `mx-6`, azioni a `px-card-inner pt-3 pb-6`. |

---

## 4. Istruzioni per lo Sviluppo Futuro
Durante lo sviluppo di nuove pagine o componenti:
1. Usare sempre `.glass-card` con i padding di spaziatura standard `.p-card-inner` o `.px-card-inner`.
2. Evitare l'uso di utilities inline ad-hoc per i padding orizzontali di card e moduli (`p-3`, `p-4`, `p-5`, `p-6` o `p-8` generici), preferendo le variabili del design system.
3. Rispettare sempre le Safe Areas in tutti i layout sovrapposti o Drawer mobili inserendo `var(--safe-bottom)` o `var(--safe-top)`.
