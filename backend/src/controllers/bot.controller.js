// ============================================
// GymMaster — Telegram bot controller
// Internal endpoints called by the bot container (X-Bot-Secret).
// ============================================

import * as botService from '../services/bot.service.js';
import { t } from '../i18n/index.js';

/** POST /api/v1/bot/collega { chatId, codice } */
export async function collega(req, res, next) {
  try {
    const { chatId, codice } = req.body;
    const dati = await botService.collegaChat(chatId, codice);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/messaggio { chatId, testo } — requires a linked account */
export async function messaggio(req, res, next) {
  try {
    const { testo } = req.body;
    const dati = await botService.elaboraMessaggio(req.utenteTelegram, testo);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/annulla { chatId } — cancels the current draft */
export async function annulla(req, res, next) {
  try {
    await botService.annullaBozza(req.utenteTelegram.id);
    res.json({ successo: true, messaggio: t('botController.bozzaAnnullata') });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/schede { chatId } — the user's own plans and the global ones */
export async function schede(req, res, next) {
  try {
    const dati = await botService.listaSchedeUtente(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/scheda { chatId, schedaId } — plan details */
export async function scheda(req, res, next) {
  try {
    const { schedaId } = req.body;
    const dati = await botService.dettaglioSchedaTesto(req.utenteTelegram.id, schedaId);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/statistiche { chatId } — statistics summary */
export async function statistiche(req, res, next) {
  try {
    const dati = await botService.statisticheTesto(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

// ─── Guided creation with buttons ───

// The regions and groups are sent back as they are to pick one; the labels
// (`etichette`, `etichettaRegione`, `etichettaGruppo`) are the names to show,
// in the user's language.
// The categories also say whether there are cardio exercises (the "Cardio /
// warm-up" button) and how many entries the draft has (/guidata asks whether
// to go on with it). Back at the categories, the draft no longer waits for
// its title.
export async function guidaCategorie(req, res, next) {
  try {
    const utenteId = req.utenteTelegram.id;
    await botService.smettiDiAttendereTitolo(utenteId);
    const [regioni, cardio, numEsercizi] = await Promise.all([
      botService.categorieEsercizi(), botService.ciSonoEserciziCardio(), botService.numeroEserciziBozza(utenteId)
    ]);
    res.json({ successo: true, dati: {
      regioni, etichette: botService.etichette(regioni, botService.nomeRegione), cardio, bozza: { numEsercizi }
    } });
  } catch (errore) { next(errore); }
}

export async function guidaGruppi(req, res, next) {
  try {
    const { bodyRegion } = req.body;
    const gruppi = await botService.gruppiPerRegione(bodyRegion);
    res.json({ successo: true, dati: {
      gruppi,
      etichette: botService.etichette(gruppi, botService.nomeGruppo),
      etichettaRegione: botService.nomeRegione(bodyRegion)
    } });
  } catch (errore) { next(errore); }
}

// A page of exercises: `offset` of this page, `precedente` and `successivo`
// those of the pages around it (null: none). "Most used" is one page only.
export async function guidaEsercizi(req, res, next) {
  try {
    const { gruppo, soloPiuUsati, soloCardio, offset } = req.body;
    const utenteId = req.utenteTelegram.id;
    if (soloPiuUsati) {
      const esercizi = await botService.eserciziPiuUsati(utenteId);
      res.json({ successo: true, dati: { esercizi, etichettaGruppo: null, offset: 0, precedente: null, successivo: null } });
      return;
    }
    const pagina = soloCardio
      ? await botService.eserciziCardio(utenteId, offset ?? 0)
      : await botService.eserciziPerGruppo(utenteId, gruppo, offset ?? 0);
    res.json({ successo: true, dati: { ...pagina, etichettaGruppo: soloCardio ? null : botService.nomeGruppo(gruppo) } });
  } catch (errore) { next(errore); }
}

export async function guidaAggiungi(req, res, next) {
  try {
    const { esercizioId, serie, ripetizioni, durataMinuti } = req.body;
    const dati = await botService.aggiungiEsercizioGuidato(req.utenteTelegram.id, esercizioId, serie, ripetizioni, durataMinuti);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /guida/nota { chatId }: "Note" waits for the note of the last entry (the next text) */
export async function guidaNota(req, res, next) {
  try {
    const dati = await botService.chiediNotaGuidata(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /guida/unisci { chatId }: "Join the previous one", a superset or a circuit */
export async function guidaUnisci(req, res, next) {
  try {
    const dati = await botService.unisciAllaPrecedenteGuidata(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /guida/titolo { chatId }: "Finish" asks for the title, with the default one proposed */
export async function guidaTitolo(req, res, next) {
  try {
    const dati = await botService.chiediTitoloGuidata(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

export async function guidaTermina(req, res, next) {
  try {
    const dati = await botService.terminaSchedaGuidata(req.utenteTelegram.id, req.body.titolo);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}
