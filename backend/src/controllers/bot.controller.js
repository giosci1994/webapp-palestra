// ============================================
// GymMaster — Controller Bot Telegram
// Endpoint interni chiamati dal container bot (X-Bot-Secret).
// ============================================

import * as botService from '../services/bot.service.js';

/** POST /api/v1/bot/collega { chatId, codice } */
export async function collega(req, res, next) {
  try {
    const { chatId, codice } = req.body;
    const dati = await botService.collegaChat(chatId, codice);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/messaggio { chatId, testo } — richiede account collegato */
export async function messaggio(req, res, next) {
  try {
    const { testo } = req.body;
    const dati = await botService.elaboraMessaggio(req.utenteTelegram, testo);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/annulla { chatId } — annulla la bozza corrente */
export async function annulla(req, res, next) {
  try {
    await botService.annullaBozza(req.utenteTelegram.id);
    res.json({ successo: true, messaggio: 'Bozza annullata' });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/schede { chatId } — lista schede dell'utente */
export async function schede(req, res, next) {
  try {
    const dati = await botService.listaSchedeUtente(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/scheda { chatId, schedaId } — dettaglio scheda */
export async function scheda(req, res, next) {
  try {
    const { schedaId } = req.body;
    const dati = await botService.dettaglioSchedaTesto(req.utenteTelegram.id, schedaId);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

/** POST /api/v1/bot/statistiche { chatId } — riepilogo statistiche */
export async function statistiche(req, res, next) {
  try {
    const dati = await botService.statisticheTesto(req.utenteTelegram.id);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

// ─── Creazione guidata a pulsanti ───

export async function guidaCategorie(req, res, next) {
  try { res.json({ successo: true, dati: { regioni: await botService.categorieEsercizi() } }); }
  catch (errore) { next(errore); }
}

export async function guidaGruppi(req, res, next) {
  try { res.json({ successo: true, dati: { gruppi: await botService.gruppiPerRegione(req.body.bodyRegion) } }); }
  catch (errore) { next(errore); }
}

export async function guidaEsercizi(req, res, next) {
  try {
    const { gruppo, soloPiuUsati } = req.body;
    const esercizi = soloPiuUsati
      ? await botService.eserciziPiuUsati(req.utenteTelegram.id)
      : await botService.eserciziPerGruppo(req.utenteTelegram.id, gruppo);
    res.json({ successo: true, dati: { esercizi } });
  } catch (errore) { next(errore); }
}

export async function guidaAggiungi(req, res, next) {
  try {
    const { esercizioId, serie, ripetizioni } = req.body;
    const dati = await botService.aggiungiEsercizioGuidato(req.utenteTelegram.id, esercizioId, serie, ripetizioni);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}

export async function guidaTermina(req, res, next) {
  try {
    const dati = await botService.terminaSchedaGuidata(req.utenteTelegram.id, req.body.titolo);
    res.json({ successo: true, dati });
  } catch (errore) { next(errore); }
}
