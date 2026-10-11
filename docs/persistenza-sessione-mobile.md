# Documentazione — Persistenza Sessione Mobile

## Panoramica
Modulo per mantenere sessione utente attiva e progressi allenamento su dispositivi mobili, dove il browser scarica tab dalla RAM durante il multitasking.

---

## Funzioni Modificate

### Frontend

#### `AuthContesto.jsx` — `gestisciVisibilita()`
- **Scopo**: Ripristina autenticazione quando utente torna alla webapp dopo cambio app
- **Trigger**: Evento `visibilitychange` → `document.visibilityState === 'visible'`
- **Logica**: Tenta refresh token via cookie HttpOnly. Se stato React perso (tab scaricata), ricarica profilo completo
- **Fallback**: Se refresh fallisce e utente era loggato → forza logout

#### `AuthContesto.jsx` — `login(email, password, ricordaDispositivo)`
- **Parametro nuovo**: `ricordaDispositivo` (Boolean, default false)
- **Effetto**: Passato al backend per estendere refresh token a 30 giorni

#### `Login.jsx` — Checkbox "Ricorda questo dispositivo"
- **UI**: Toggle switch con stato persistente in `localStorage`
- **Chiave**: `gymmaster_ricorda_dispositivo`
- **Effetto**: Quando attivo → refresh token 30gg, cookie 30gg

#### `useRottaPersistente.js`
- **Cambiamento**: `sessionStorage` → `localStorage`
- **Motivazione**: `sessionStorage` distrutto su tab kill mobile. `localStorage` sopravvive

#### `WorkoutLive.jsx` — Persistenza Progressi
- **Chiave localStorage**: `gymmaster_workout_{sessioneId}`
- **Dati salvati**: `esercizioIdx`, `serieCorrente`, `form`, `serieCompletate`, `eserciziLive`, `tempoInizio`
- **Debounce**: 500ms per evitare scritture eccessive
- **Ripristino**: Al mount, se chiave esiste in localStorage
- **Pulizia**: Al completamento allenamento (`completaAllenamento()`)

#### `utils/codaSerie.js` — Serie registrate senza rete
- **Scopo**: In palestra la rete va e viene. Serie, serie saltate e "Termina" si scrivono subito sul telefono e partono verso il server in ordine, appena si può
- **Chiave localStorage**: `gymmaster_coda_serie_{utenteId}` (una coda per utente: chi esce e chi entra sullo stesso telefono non si scambiano le serie)
- **Doppioni**: ogni voce ha una chiave (`idClient`); se la risposta si perde e la voce riparte, il server la riconosce e non la registra due volte
- **Orari**: ogni voce porta l'ora in cui è stata fatta (`registrataIl` per le serie, `conclusaIl` per "Termina"); arrivata in ritardo, conta quella
- **Invio**: `hooks/useCodaSerie.js` → `useInvioCoda()` in `LayoutAutenticato`: all'apertura, quando torna la rete (`online`), quando si torna nell'app e ogni 30 secondi finché resta qualcosa. Un invio alla volta, anche fra schede (`navigator.locks`)
- **Errori**: senza rete, 401, 408, 429 o 5xx la voce resta e si riprova; un 404 vuol dire che l'allenamento sul server non c'è più (aperto senza serie per un giorno, il server lo elimina) e le sue voci diventano un allenamento passato (`POST /sessioni/passata`); gli altri rifiuti tolgono la voce
- **Interfaccia**: in `WorkoutLive` un avviso quando ci sono serie ferme da qualche secondo; "Termina" senza rete mostra il riepilogo e dice che l'allenamento partirà con la rete; "Ho chiuso per sbaglio" toglie "Termina" dalla coda se non è ancora partito
- **Limite**: l'app va aperta con la rete almeno una volta dopo l'allenamento, perché la coda parta; riaprirla da chiusa senza rete non è ancora possibile (serve la pagina in cache e l'accesso senza server)

---

### Backend

#### `autenticazione.service.js` — `loginUtente({ email, password, ricordaDispositivo })`
- **Parametro nuovo**: `ricordaDispositivo` (Boolean)
- **Effetto**: Se true → `durataGiorni = 30`, altrimenti valore da env `JWT_SCADENZA_REFRESH` (default 7)
- **Return nuovo campo**: `durataGiorni` propagato al controller

#### `autenticazione.service.js` — `rinnovaToken(tokenRefresh)`
- **Grace period**: Vecchio token marcato revocato ma accettato per 40 secondi (`revocoEffettivoDopo`)
- **Logica grace**: Se token revocato + nel grace period → cerca token sostitutivo più recente
- **Propagazione durata**: `durataGiorni` ereditato dal token originale

#### `autenticazione.service.js` — `generaRefreshToken(utenteId, durataGiorni)`
- **Parametro nuovo**: `durataGiorni` (Int, opzionale)
- **Pulizia migliorata**: Elimina token revocati solo se grace period scaduto

#### `autenticazione.controller.js` — `login()` e `refresh()`
- **Cookie maxAge dinamico**: `durataGiorni * 24 * 60 * 60 * 1000` (7gg o 30gg)

#### `sessioni.controller.js` — serie e "Termina" dalla coda del telefono
- **`POST /sessioni/:id/serie`**: accetta `idClient` (unico nell'allenamento: una serie già arrivata restituisce quella salvata, 200) e `registrataIl` (tenuto fra l'inizio dell'allenamento e adesso). Una serie che arriva ad allenamento già chiuso lo richiude contandola: durata, volume e record la comprendono
- **`PATCH /sessioni/:id/completa`**: accetta `conclusaIl`, l'ora in cui è stato toccato "Termina"
- **Controllo periodico** (`conclusioneSessione.service.js`): un allenamento aperto senza serie si elimina dopo un giorno (`ORE_SESSIONE_VUOTA`), non dopo due ore: le serie possono essere ancora in coda su un telefono senza rete. I record si datano alla fine dell'allenamento, non al momento della chiusura

---

### Schema Prisma — `RefreshToken`

| Campo Nuovo | Tipo | Default | Descrizione |
|-------------|------|---------|-------------|
| `revocoEffettivoDopo` | DateTime? | null | Token accettato fino a questo timestamp anche se revocato |
| `durataGiorni` | Int | 7 | Durata originale per propagare al refresh successivo |

### Schema Prisma — `LogSerie`

| Campo Nuovo | Tipo | Default | Descrizione |
|-------------|------|---------|-------------|
| `idClient` | String? | null | Chiave scelta dal telefono, unica con `sessioneId`: la stessa serie inviata due volte si registra una volta sola |

---

## Flusso Completo

```
[Login] → ricordaDispositivo=true
  ↓
[Backend] → genera refreshToken (30gg) + cookie (30gg)
  ↓
[Utente cambia app] → tab scaricata dalla RAM
  ↓
[Utente torna] → visibilitychange fired
  ↓
[AuthContesto] → fetch /auth/refresh (cookie HttpOnly sopravvive)
  ↓
[Backend] → rotazione token con grace period 40s
  ↓
[AuthContesto] → nuovo accessToken + ricarica profilo
  ↓
[WorkoutLive] → ripristina progressi da localStorage
```
