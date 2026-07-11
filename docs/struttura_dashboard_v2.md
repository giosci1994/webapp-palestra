# Struttura Dashboard V2 (Stile REVOO - Dark Theme)

## Panoramica
La Dashboard è stata riprogettata per migliorare la pulizia visiva e l'usabilità, passando da un approccio a singola pagina "larga" (con grandi KPI cards) ad un approccio a **Tab (Attività / Statistiche)**, basato su pannelli e liste.
L'obiettivo è mantenere l'estetica scura (`index.css` dark-premium) ma ereditare le logiche modulari viste in app del settore come REVOO.

## Libreria Icone
È stata adottata la libreria **`lucide-react`** per gestire tutte le icone nell'app (sia in Dashboard che nelle Navigation Bar), sostituendo le vecchie Emoji.
- Vantaggi: Consistenza visiva, controllo su `size` e `stroke`, miglior adattamento all'hover e alle transizioni di colore.

## Componente Dashboard.jsx
Il layout è governato dallo stato `tabAttivo` ("attività" | "statistiche") con animazioni gestite tramite `framer-motion` (`<AnimatePresence>`).

### Header e Banner
- L'header si limita a un cordiale saluto ("Buongiorno/Buonasera, Nome")
- È stato introdotto un **Banner Comunicazioni** configurabile, utile all'amministratore per notificare eventi globali agli utenti (es. "Scadenza periodo di prova").

### Tab "Attività"
Implementa una `grid` asimmetrica per Desktop: `grid-cols-[1fr_300px]`.
#### Colonna Principale (1fr)
1. **Nuovi Messaggi**: Box minimale per accedere velocemente alla `/chat`.
2. **Prossime scadenze**: Lista di bottoni a riga per i link rapidi (Piani, Video, Abbonamenti). L'aggiunta di icone e Chevron `>` rende questa sezione molto simile a un'app nativa.
3. **Ultime attività clienti**: Recap in stile lista ( `<ul>` / `<li>` ) degli allenamenti svolti di recente.

#### Colonna Laterale (300px)
Visibile su lato destro su PC, impilata in basso su dispositivi Mobile:
1. **Note**: Include una `textarea` per i memo personali.
2. **In Calendario**: Mostra i task giornalieri.

### Tab "Statistiche"
Un'area di atterraggio per future feature analitiche (Grafici `recharts`, Record Personali). Sostituisce le vecchie 4 KPI card.

## Navigation Bar
- **`BarraNavigazione.jsx` (Mobile)**: Implementa la libreria Lucide. Il bottone "Azione" è stato mantenuto come "Float" centrale sopraelevato.
- **`Sidebar.jsx` (Desktop)**: Utilizza `lucide-react` e aggiorna il logo testuale con l'icona `<Activity />`.
