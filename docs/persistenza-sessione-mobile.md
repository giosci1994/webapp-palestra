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

---

### Schema Prisma — `RefreshToken`

| Campo Nuovo | Tipo | Default | Descrizione |
|-------------|------|---------|-------------|
| `revocoEffettivoDopo` | DateTime? | null | Token accettato fino a questo timestamp anche se revocato |
| `durataGiorni` | Int | 7 | Durata originale per propagare al refresh successivo |

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
