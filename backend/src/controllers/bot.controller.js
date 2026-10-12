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

/** POST /api/v1/bot/schede { chatId } — list of the user's plans */
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
export async function guidaCategorie(req, res, next) {
  try {
    const regioni = await botService.categorieEsercizi();
    res.json({ successo: true, dati: { regioni, etichette: botService.etichette(regioni, botService.nomeRegione) } });
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

export async function guidaEsercizi(req, res, next) {
  try {
    const { gruppo, soloPiuUsati } = req.body;
    const esercizi = soloPiuUsati
      ? await botService.eserciziPiuUsati(req.utenteTelegram.id)
      : await botService.eserciziPerGruppo(req.utenteTelegram.id, gruppo);
    res.json({ successo: true, dati: { esercizi, etichettaGruppo: soloPiuUsati ? null : botService.nomeGruppo(gruppo) } });
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
