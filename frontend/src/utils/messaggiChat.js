// The messages of the open conversation (Conversazione.jsx).

/**
 * The list with a message that arrived through the socket. The socket can
 * still be in the room of another conversation (the page was changed from
 * one chat to another): only a message of the open conversation is added,
 * and only once.
 * @param {object[]} messaggi - the ones on screen
 * @param {object} messaggio - from chat:nuovo_messaggio
 * @param {number} conversazioneId - the open conversation
 */
export function conNuovoMessaggio(messaggi, messaggio, conversazioneId) {
  if (!messaggio || messaggio.conversazioneId !== conversazioneId) return messaggi;
  if (messaggi.some(m => m.id === messaggio.id)) return messaggi;
  return [...messaggi, messaggio];
}
