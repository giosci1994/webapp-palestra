// ============================================
// GymMaster — Today's workout reminder, put off for the day
// ============================================
//
// "Later" on the reminder of today's workout means "not again today". It used
// to come back at every opening of the app, and the only way to stop it was
// moving the workout to tomorrow. The workout stays on the Home page, ready to
// start once at the gym.
//
// The choice is kept on this phone, for the planned workouts it was made for:
// one added later in the day (by the trainer, say) shows the reminder again.

const CHIAVE = 'gymmaster_promemoria_rimandato';

/**
 * Remembers that the reminder of these workouts was put off until tomorrow.
 * @param {{ data: string, allenamenti: { id: number }[] }} dati - from GET /pianificazione/oggi
 */
export function rimandaPromemoria(dati, archivio = globalThis.localStorage) {
  if (!dati?.allenamenti?.length) return;
  try {
    archivio?.setItem(CHIAVE, JSON.stringify({ giorno: dati.data, id: dati.allenamenti.map(a => a.id) }));
  } catch {
    // Not saved (private browsing, storage full): it shows at the next opening
  }
}

/**
 * Whether the reminder has something to show: today's workouts, unless it
 * was already put off for all of them.
 * @param {{ data: string, allenamenti: { id: number }[] } | null} dati - from GET /pianificazione/oggi
 */
export function promemoriaDaMostrare(dati, archivio = globalThis.localStorage) {
  if (!dati?.allenamenti?.length) return false;
  let rimandato = null;
  try {
    rimandato = JSON.parse(archivio?.getItem(CHIAVE) || 'null');
  } catch {
    // Unreadable: better shown once more than never
  }
  if (rimandato?.giorno !== dati.data || !Array.isArray(rimandato.id)) return true;
  return dati.allenamenti.some(a => !rimandato.id.includes(a.id));
}
