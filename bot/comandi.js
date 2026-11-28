// ============================================
// GymMaster — The bot's commands, in Italian and in English
// Each command answers to both names with the same handler (bot.js); the
// Telegram menu (setMyCommands) and the help texts show the names of the
// user's language. Pure (no grammY), so the tests can import it.
// ============================================

import { tLingua } from './testi.js';

/** Every command: its Italian and English name and the key of its menu description */
export const COMANDI = [
  { it: 'nuova', en: 'new', descrizione: 'comandoNuova' },
  { it: 'guidata', en: 'guided', descrizione: 'comandoGuidata' },
  { it: 'schede', en: 'plans', descrizione: 'comandoSchede' },
  { it: 'statistiche', en: 'stats', descrizione: 'comandoStatistiche' },
  { it: 'annulla', en: 'cancel', descrizione: 'comandoAnnulla' },
  { it: 'start', en: 'start', descrizione: 'comandoStart' }
];

/** The names a command answers to (Italian first), from its Italian name, for bot.command */
export function nomiComando(nomeItaliano) {
  const comando = COMANDI.find(c => c.it === nomeItaliano);
  if (!comando) throw new Error(`Unknown command: ${nomeItaliano}`);
  return [...new Set([comando.it, comando.en])];
}

/** The command names of a language: Italian for Italian, English for every other */
export const nomiInLingua = lingua => COMANDI.map(c => (lingua === 'it' ? c.it : c.en));

/** The menu for setMyCommands in `lingua`: the names of that language, the descriptions in it */
export const menuComandi = lingua => COMANDI.map((c, i) => ({
  command: nomiInLingua(lingua)[i],
  description: tLingua(lingua, c.descrizione)
}));
