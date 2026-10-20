// ============================================
// GymMaster — Users controller
// Handles the HTTP requests for user management
// ============================================

import * as utentiService from '../services/utenti.service.js';
import { esportaDatiUtente, nomeFileEsportazione } from '../services/esportazioneDati.service.js';
import logger from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/** GET /api/v1/utenti — List of users (SuperAdmin only) */
export async function listaUtenti(req, res, next) {
  try {
    const { pagina = 1, limite = 20, stato, ruolo } = req.query;
    const risultato = await utentiService.ottieniTuttiGliUtenti({
      pagina: parseInt(pagina),
      limite: parseInt(limite),
      stato,
      ruolo
    });

    res.json({ successo: true, dati: risultato });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/utenti/profilo — Profile of the authenticated user */
export async function profilo(req, res, next) {
  try {
    const utente = await utentiService.ottieniProfilo(req.utente.id);
    res.json({ successo: true, dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/**
 * GET /api/v1/utenti/esportazione — Downloads all of one's own data in a JSON file
 * (access and portability, GDPR art. 15 and 20)
 */
export async function esportaDati(req, res, next) {
  try {
    const dati = await esportaDatiUtente(req.utente.id);
    logger.info({ utenteId: req.utente.id }, 'Dati dell\'account esportati');
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeFileEsportazione()}"`,
      // Personal data: neither the browser nor a proxy may keep a copy
      'Cache-Control': 'no-store'
    });
    res.send(JSON.stringify(dati, null, 2));
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/:id/approva — Approves a user (SuperAdmin only) */
export async function approva(req, res, next) {
  try {
    const utente = await utentiService.approvaUtente(parseInt(req.params.id));
    res.json({ successo: true, messaggio: t('utentiController.utenteApprovato'), dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/:id/banna — Bans a user (SuperAdmin only) */
export async function banna(req, res, next) {
  try {
    const utente = await utentiService.bannaUtente(parseInt(req.params.id));
    res.json({ successo: true, messaggio: t('utentiController.utenteBannato'), dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/:id/ruolo — Changes the role (SuperAdmin only) */
export async function cambiaRuolo(req, res, next) {
  try {
    const { ruolo } = req.body;
    const utente = await utentiService.cambiaRuolo(parseInt(req.params.id), ruolo);
    res.json({ successo: true, messaggio: t('utentiController.ruoloAggiornato'), dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** DELETE /api/v1/utenti/:id — Deletes a user (SuperAdmin only) */
export async function elimina(req, res, next) {
  try {
    await utentiService.eliminaUtente(parseInt(req.params.id));
    res.json({ successo: true, messaggio: t('utentiController.utenteEliminato') });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/profilo — Updates the user's profile */
export async function aggiornaProfilo(req, res, next) {
  try {
    const utente = await utentiService.aggiornaProfilo(req.utente.id, req.body);
    res.json({ successo: true, messaggio: t('utentiController.profiloAggiornato'), dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** POST /api/v1/utenti/cambia-password — Changes the password */
export async function cambiaPassword(req, res, next) {
  try {
    const { vecchiaPassword, nuovaPassword } = req.body;
    await utentiService.cambiaPassword(req.utente.id, vecchiaPassword, nuovaPassword, req.utente.famiglia);
    res.json({ successo: true, messaggio: t('utentiController.passwordAggiornata') });
  } catch (errore) {
    next(errore);
  }
}

/**
 * Version, build date and stack from version.json, read once: it changes only
 * with a release, which recreates the backend. The changelog stays out: the
 * app does not show it, and it is most of the file.
 */
let infoVersione;
function leggiInfoVersione() {
  if (!infoVersione) {
    try {
      const { versione, build, stack } = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../version.json'), 'utf-8'));
      infoVersione = { versione, build, stack };
    } catch {
      infoVersione = { versione: '1.0.0', build: 'N/A', stack: {} };
    }
  }
  return infoVersione;
}

/** GET /api/v1/utenti/info-app — Technical info about the application */
export async function infoApp(req, res, next) {
  try {
    res.json({
      successo: true,
      dati: {
        ...leggiInfoVersione(),
        nodeVersion: process.version,
        ambiente: process.env.AMBIENTE || 'sviluppo'
      }
    });
  } catch (errore) {
    next(errore);
  }
}
