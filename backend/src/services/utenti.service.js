// ============================================
// GymMaster — Users service
// Business logic for user management
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';
import argon2 from 'argon2';
import logger from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { chiudiAltreSessioni } from './autenticazione.service.js';
import { leggiLingua } from '../utils/lingue.js';

/**
 * Gets the list of all users (SuperAdmin only).
 */
export async function ottieniTuttiGliUtenti({ pagina = 1, limite = 20, stato, ruolo }) {
  const dove = {};
  if (stato) dove.stato = stato;
  if (ruolo) dove.ruolo = ruolo;

  const [utenti, totale] = await Promise.all([
    prisma.utente.findMany({
      where: dove,
      select: {
        id: true,
        email: true,
        nome: true,
        ruolo: true,
        stato: true,
        ruoloRichiesto: true,
        puntiEsperienza: true,
        dataRegistrazione: true,
        ultimoAccesso: true,
        emailVerificata: true,
        immagineProfilo: true,
        palestra: { select: { id: true, nomeCatena: true, citta: true } },
        _count: { select: { schedeCreate: true, sessioni: true, clientiComePT: true } }
      },
      skip: (pagina - 1) * limite,
      take: limite,
      orderBy: { dataRegistrazione: 'desc' }
    }),
    prisma.utente.count({ where: dove })
  ]);

  return {
    utenti,
    paginazione: {
      pagina,
      limite,
      totale,
      pagine: Math.ceil(totale / limite)
    }
  };
}

/**
 * Approves a user, or lifts a ban: from IN_ATTESA or BANNATO to ATTIVO.
 */
export async function approvaUtente(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });

  if (!utente) throw new ErroreNonTrovato(t('utentiService.utenteNonTrovato'));
  if (utente.stato !== 'IN_ATTESA' && utente.stato !== 'BANNATO') {
    throw new ErroreNonAutorizzato(t('utentiService.impossibileApprovare', { stato: utente.stato }));
  }

  const utenteAggiornato = await prisma.utente.update({
    where: { id: utenteId },
    data: { stato: 'ATTIVO' },
    select: { id: true, email: true, nome: true, stato: true }
  });

  logger.info({ utenteId }, 'Utente approvato');
  return utenteAggiornato;
}

/**
 * Bans a user.
 */
export async function bannaUtente(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });
  if (!utente) throw new ErroreNonTrovato(t('utentiService.utenteNonTrovato'));

  if (utente.ruolo === 'SUPERADMIN') {
    throw new ErroreNonAutorizzato(t('utentiService.nonPuoiBannareSuperAdmin'));
  }

  const utenteAggiornato = await prisma.utente.update({
    where: { id: utenteId },
    data: { stato: 'BANNATO' },
    select: { id: true, email: true, nome: true, stato: true }
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.updateMany({
    where: { utenteId },
    data: { revocato: true }
  });

  logger.info({ utenteId }, 'Utente bannato');
  return utenteAggiornato;
}

/**
 * Changes a user's role (SuperAdmin only).
 */
export async function cambiaRuolo(utenteId, nuovoRuolo) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });
  if (!utente) throw new ErroreNonTrovato(t('utentiService.utenteNonTrovato'));

  const utenteAggiornato = await prisma.utente.update({
    where: { id: utenteId },
    data: { ruolo: nuovoRuolo },
    select: { id: true, email: true, nome: true, ruolo: true }
  });

  logger.info({ utenteId, nuovoRuolo }, 'Ruolo utente aggiornato');
  return utenteAggiornato;
}

/**
 * Gets the authenticated user's profile.
 */
export async function ottieniProfilo(utenteId) {
  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: {
      id: true,
      email: true,
      nome: true,
      ruolo: true,
      stato: true,
      puntiEsperienza: true,
      dataRegistrazione: true,
      chatRetentionGiorni: true,
      immagineProfilo: true,
      dataNascita: true,
      pesoKg: true,
      altezzaCm: true,
      genere: true,
      bio: true,
      obiettivoFitness: true,
      preferenzeVisibilita: true,
      profiloCompletato: true,
      gamificationAttiva: true,
      ruoloRichiesto: true,
      lingua: true,
      palestra: { select: { id: true, nomeCatena: true, citta: true, nazione: true } }
    }
  });

  if (!utente) throw new ErroreNonTrovato(t('utentiService.utenteNonTrovato'));
  return utente;
}

/**
 * Updates the user's profile data.
 */
export async function aggiornaProfilo(utenteId, dati) {
  // Fields allowed in the update
  const campiConsentiti = [
    'nome', 'immagineProfilo', 'dataNascita', 'pesoKg', 'altezzaCm',
    'genere', 'bio', 'obiettivoFitness', 'preferenzeVisibilita',
    'gamificationAttiva', 'palestraId', 'lingua'
  ];

  const datiAggiornamento = {};

  for (const campo of campiConsentiti) {
    if (dati[campo] !== undefined) {
      if (campo === 'dataNascita' && dati[campo]) {
        datiAggiornamento[campo] = new Date(dati[campo]);
      } else if (campo === 'pesoKg' && dati[campo] !== null) {
        datiAggiornamento[campo] = parseFloat(dati[campo]);
      } else if (campo === 'altezzaCm' && dati[campo] !== null) {
        datiAggiornamento[campo] = parseInt(dati[campo]);
      } else if (campo === 'palestraId') {
        datiAggiornamento[campo] = dati[campo] ? parseInt(dati[campo]) : null;
      } else if (campo === 'lingua') {
        datiAggiornamento[campo] = leggiLingua(dati[campo]);
      } else {
        datiAggiornamento[campo] = dati[campo];
      }
    }
  }

  // Bio validation (max 200 characters)
  if (datiAggiornamento.bio && datiAggiornamento.bio.length > 200) {
    throw new ErroreValidazione(t('utentiService.bioTroppoLunga'));
  }

  // Image validation (max ~300KB base64)
  if (datiAggiornamento.immagineProfilo && datiAggiornamento.immagineProfilo.length > 400000) {
    throw new ErroreValidazione(t('utentiService.immagineTroppoGrande'));
  }

  const utenteAggiornato = await prisma.utente.update({
    where: { id: utenteId },
    data: datiAggiornamento,
    select: {
      id: true,
      email: true,
      nome: true,
      ruolo: true,
      stato: true,
      puntiEsperienza: true,
      dataRegistrazione: true,
      chatRetentionGiorni: true,
      immagineProfilo: true,
      dataNascita: true,
      pesoKg: true,
      altezzaCm: true,
      genere: true,
      bio: true,
      obiettivoFitness: true,
      preferenzeVisibilita: true,
      gamificationAttiva: true,
      lingua: true,
      palestra: { select: { id: true, nomeCatena: true, citta: true, nazione: true } }
    }
  });

  logger.info({ utenteId }, 'Profilo aggiornato');
  return utenteAggiornato;
}

/**
 * Changes the password and signs out the other devices: if someone got in
 * with the old one, they stay out. The session the change comes from stays open.
 * @param {string|null} famigliaCorrente - the request's session
 */
export async function cambiaPassword(utenteId, vecchiaPassword, nuovaPassword, famigliaCorrente = null) {
  if (!vecchiaPassword || !nuovaPassword) {
    throw new ErroreValidazione(t('utentiService.passwordObbligatorie'));
  }

  if (nuovaPassword.length < 8) {
    throw new ErroreValidazione(t('utentiService.nuovaPasswordCorta'));
  }

  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: { passwordHash: true }
  });

  if (!utente) throw new ErroreNonTrovato(t('utentiService.utenteNonTrovato'));

  // Check the old password
  const passwordValida = await argon2.verify(utente.passwordHash, vecchiaPassword);
  if (!passwordValida) {
    throw new ErroreValidazione(t('utentiService.passwordAttualeErrata'));
  }

  // Hash the new password
  const nuovoHash = await argon2.hash(nuovaPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });

  await prisma.utente.update({
    where: { id: utenteId },
    data: { passwordHash: nuovoHash }
  });
  await chiudiAltreSessioni(utenteId, famigliaCorrente);

  logger.info({ utenteId }, 'Password cambiata');
  return true;
}

/**
 * Permanently deletes a user and all their related data (SuperAdmin only).
 */
export async function eliminaUtente(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });
  if (!utente) throw new ErroreNonTrovato(t('utentiService.utenteNonTrovato'));

  if (utente.ruolo === 'SUPERADMIN') {
    throw new ErroreNonAutorizzato(t('utentiService.impossibileEliminareSuperAdmin'));
  }

  // Delete everything in one transaction to avoid constraint errors (foreign keys)
  await prisma.$transaction([
    prisma.logSerie.deleteMany({ where: { sessione: { utenteId } } }),
    prisma.sessioneAllenamento.deleteMany({ where: { utenteId } }),
    prisma.recordPersonale.deleteMany({ where: { utenteId } }),
    prisma.esercizioScheda.deleteMany({ where: { scheda: { creatoreId: utenteId } } }),
    prisma.schedaAllenamento.deleteMany({ where: { creatoreId: utenteId } }),
    prisma.messaggio.deleteMany({ where: { mittenteId: utenteId } }),
    prisma.utente.delete({ where: { id: utenteId } })
  ]);

  logger.info({ utenteId }, 'Utente eliminato definitivamente');
  return true;
}
