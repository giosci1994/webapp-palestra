// ============================================
// GymMaster — Service Utenti
// Logica di business per gestione utenti
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreNonAutorizzato, ErroreValidazione } from '../utils/errori.js';
import argon2 from 'argon2';
import logger from '../utils/logger.js';

/**
 * Recupera la lista di tutti gli utenti (solo SuperAdmin).
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
 * Approva un utente (cambia stato da IN_ATTESA ad ATTIVO).
 */
export async function approvaUtente(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });

  if (!utente) throw new ErroreNonTrovato('Utente');
  if (utente.stato !== 'IN_ATTESA' && utente.stato !== 'BANNATO') {
    throw new ErroreNonAutorizzato(`Impossibile approvare un utente in stato: ${utente.stato}`);
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
 * Banna un utente.
 */
export async function bannaUtente(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });
  if (!utente) throw new ErroreNonTrovato('Utente');

  if (utente.ruolo === 'SUPERADMIN') {
    throw new ErroreNonAutorizzato('Non puoi bannare un SuperAdmin');
  }

  const utenteAggiornato = await prisma.utente.update({
    where: { id: utenteId },
    data: { stato: 'BANNATO' },
    select: { id: true, email: true, nome: true, stato: true }
  });

  // Revoca tutti i refresh token
  await prisma.refreshToken.updateMany({
    where: { utenteId },
    data: { revocato: true }
  });

  logger.info({ utenteId }, 'Utente bannato');
  return utenteAggiornato;
}

/**
 * Cambia il ruolo di un utente (solo SuperAdmin).
 */
export async function cambiaRuolo(utenteId, nuovoRuolo) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });
  if (!utente) throw new ErroreNonTrovato('Utente');

  const utenteAggiornato = await prisma.utente.update({
    where: { id: utenteId },
    data: { ruolo: nuovoRuolo },
    select: { id: true, email: true, nome: true, ruolo: true }
  });

  logger.info({ utenteId, nuovoRuolo }, 'Ruolo utente aggiornato');
  return utenteAggiornato;
}

/**
 * Recupera il profilo dell'utente autenticato.
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
      palestra: { select: { id: true, nomeCatena: true, citta: true, nazione: true } }
    }
  });

  if (!utente) throw new ErroreNonTrovato('Utente');
  return utente;
}

/**
 * Aggiorna i dati del profilo utente.
 */
export async function aggiornaProfilo(utenteId, dati) {
  // Campi consentiti per l'aggiornamento
  const campiConsentiti = [
    'nome', 'immagineProfilo', 'dataNascita', 'pesoKg', 'altezzaCm',
    'genere', 'bio', 'obiettivoFitness', 'preferenzeVisibilita',
    'gamificationAttiva', 'palestraId'
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
      } else {
        datiAggiornamento[campo] = dati[campo];
      }
    }
  }

  // Validazione bio (max 200 caratteri)
  if (datiAggiornamento.bio && datiAggiornamento.bio.length > 200) {
    throw new ErroreValidazione('La bio non può superare i 200 caratteri');
  }

  // Validazione immagine (max ~300KB base64)
  if (datiAggiornamento.immagineProfilo && datiAggiornamento.immagineProfilo.length > 400000) {
    throw new ErroreValidazione('Immagine troppo grande. Massimo 300KB.');
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
      palestra: { select: { id: true, nomeCatena: true, citta: true, nazione: true } }
    }
  });

  logger.info({ utenteId }, 'Profilo aggiornato');
  return utenteAggiornato;
}

/**
 * Cambia la password dell'utente.
 */
export async function cambiaPassword(utenteId, vecchiaPassword, nuovaPassword) {
  if (!vecchiaPassword || !nuovaPassword) {
    throw new ErroreValidazione('Vecchia password e nuova password sono obbligatorie');
  }

  if (nuovaPassword.length < 8) {
    throw new ErroreValidazione('La nuova password deve avere almeno 8 caratteri');
  }

  const utente = await prisma.utente.findUnique({
    where: { id: utenteId },
    select: { passwordHash: true }
  });

  if (!utente) throw new ErroreNonTrovato('Utente');

  // Verifica la vecchia password
  const passwordValida = await argon2.verify(utente.passwordHash, vecchiaPassword);
  if (!passwordValida) {
    throw new ErroreValidazione('La password attuale non è corretta');
  }

  // Hash della nuova password
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

  logger.info({ utenteId }, 'Password cambiata');
  return true;
}

/**
 * Elimina definitivamente un utente e tutti i suoi dati correlati (solo SuperAdmin).
 */
export async function eliminaUtente(utenteId) {
  const utente = await prisma.utente.findUnique({ where: { id: utenteId } });
  if (!utente) throw new ErroreNonTrovato('Utente');

  if (utente.ruolo === 'SUPERADMIN') {
    throw new ErroreNonAutorizzato('Impossibile eliminare un SuperAdmin. Declassalo prima a UTENTE.');
  }

  // Elimina tutto con una transazione per evitare errori di vincolo (Foreign Keys)
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
