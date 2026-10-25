// ============================================
// GymMaster — Notifications: the list and what is left to read
// ============================================
//
// Pure helpers for contesti/NotificheContesto.jsx: the bell (desktop), the
// Notifiche tab of the chat page and the badge of the bottom bar (phone)
// show the same list.

/** The most recent notifications kept in the app */
export const NOTIFICHE_MAX = 50;

/** A notification just arrived goes on top, once; the list keeps the latest `max` */
export function conNuova(notifiche, nuova, max = NOTIFICHE_MAX) {
  return [nuova, ...notifiche.filter(n => n.id !== nuova.id)].slice(0, max);
}

/** The list with notification `id` read */
export function conLetta(notifiche, id) {
  return notifiche.map(n => (n.id === id && !n.letta ? { ...n, letta: true } : n));
}

/** The list with every notification read */
export function tutteLette(notifiche) {
  return notifiche.map(n => (n.letta ? n : { ...n, letta: true }));
}

/**
 * Where a notification leads: a path inside the app ("/pianificazione"), or
 * null. Never an address outside it, not even a protocol-relative one ("//…").
 */
export function percorsoInterno(percorso) {
  return typeof percorso === 'string' && percorso.startsWith('/') && !percorso.startsWith('//') ? percorso : null;
}

/** The number on a badge: up to 9, then "9+"; empty at zero */
export function testoContatore(numero) {
  if (!(numero > 0)) return '';
  return numero > 9 ? '9+' : String(numero);
}
