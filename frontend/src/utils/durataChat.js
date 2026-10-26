// How long the messages a user sends stay in the chat (Profile → Privacy).
// The server deletes the user's messages older than chatRetentionGiorni days,
// for everybody in the conversation; 0 keeps them forever.

/** The choices offered, in days; 0 is "forever" */
export const DURATE_CHAT = [7, 30, 90, 365, 0];

/**
 * The choices to show: the standard ones, plus the user's own when it is
 * another one (set before this setting existed), in order, "forever" last.
 */
export function scelteDurataChat(attuale) {
  const giorni = new Set(DURATE_CHAT.filter(g => g > 0));
  if (Number.isInteger(attuale) && attuale > 0) giorni.add(attuale);
  return [...[...giorni].sort((a, b) => a - b), 0];
}

/** The translation key and values that name a choice: "Forever", "1 year", "30 days" */
export function etichettaDurataChat(giorni) {
  if (giorni === 0) return ['profilo.privacy.chat.perSempre', {}];
  if (giorni % 365 === 0) return ['profilo.privacy.chat.anni', { count: giorni / 365 }];
  return ['profilo.privacy.chat.giorni', { count: giorni }];
}
