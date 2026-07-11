// ============================================
// GymMaster — Controller Utenti
// Gestisce le richieste HTTP per gestione utenti
// ============================================

import * as utentiService from '../services/utenti.service.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/** GET /api/v1/utenti — Lista utenti (Solo SuperAdmin) */
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

/** GET /api/v1/utenti/profilo — Profilo utente autenticato */
export async function profilo(req, res, next) {
  try {
    const utente = await utentiService.ottieniProfilo(req.utente.id);
    res.json({ successo: true, dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/:id/approva — Approva utente (Solo SuperAdmin) */
export async function approva(req, res, next) {
  try {
    const utente = await utentiService.approvaUtente(parseInt(req.params.id));
    res.json({ successo: true, messaggio: 'Utente approvato', dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/:id/banna — Banna utente (Solo SuperAdmin) */
export async function banna(req, res, next) {
  try {
    const utente = await utentiService.bannaUtente(parseInt(req.params.id));
    res.json({ successo: true, messaggio: 'Utente bannato', dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/:id/ruolo — Cambia ruolo (Solo SuperAdmin) */
export async function cambiaRuolo(req, res, next) {
  try {
    const { ruolo } = req.body;
    const utente = await utentiService.cambiaRuolo(parseInt(req.params.id), ruolo);
    res.json({ successo: true, messaggio: 'Ruolo aggiornato', dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** DELETE /api/v1/utenti/:id — Elimina utente (Solo SuperAdmin) */
export async function elimina(req, res, next) {
  try {
    await utentiService.eliminaUtente(parseInt(req.params.id));
    res.json({ successo: true, messaggio: 'Utente eliminato definitivamente' });
  } catch (errore) {
    next(errore);
  }
}

/** PATCH /api/v1/utenti/profilo — Aggiorna profilo utente */
export async function aggiornaProfilo(req, res, next) {
  try {
    const utente = await utentiService.aggiornaProfilo(req.utente.id, req.body);
    res.json({ successo: true, messaggio: 'Profilo aggiornato', dati: utente });
  } catch (errore) {
    next(errore);
  }
}

/** POST /api/v1/utenti/cambia-password — Cambia password */
export async function cambiaPassword(req, res, next) {
  try {
    const { vecchiaPassword, nuovaPassword } = req.body;
    await utentiService.cambiaPassword(req.utente.id, vecchiaPassword, nuovaPassword);
    res.json({ successo: true, messaggio: 'Password aggiornata con successo' });
  } catch (errore) {
    next(errore);
  }
}

/** GET /api/v1/utenti/info-app — Info tecniche dell'applicazione */
export async function infoApp(req, res, next) {
  try {
    // Leggi version.json dalla root del progetto
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const versionPath = resolve(__dirname, '../../../version.json');
    let versionData;
    try {
      versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
    } catch {
      versionData = { versione: '1.0.0', build: 'N/A', changelog: [], stack: {} };
    }

    res.json({
      successo: true,
      dati: {
        versione: versionData.versione,
        build: versionData.build,
        nodeVersion: process.version,
        ambiente: process.env.AMBIENTE || 'sviluppo',
        stack: versionData.stack,
        changelog: versionData.changelog
      }
    });
  } catch (errore) {
    next(errore);
  }
}
