// ============================================
// GymMaster — Data export
// Full copy of a user's data
// ============================================
//
// The right of access and the right to data portability (GDPR, art. 15 and
// 20) that the privacy policy promises: everything GymMaster keeps about a
// person, in a JSON file that any program can read.
//
// Two rules:
// - no secrets: password hash, session, verification and reset tokens,
//   Telegram link code;
// - of other users, only the name. Chats also contain the messages received,
//   because half a conversation is useless, but the other people's email and
//   profile are their data.
//
// For models without secrets every field is exported, so a column added
// tomorrow gets into the file on its own. The profile instead is listed field
// by field (CAMPI_PROFILO / CAMPI_RISERVATI), and a test checks that every
// column of Utente is in one of the two lists.

import prisma from '../config/database.js';
import { giornoLocale } from '../utils/date.js';
import { t } from '../i18n/index.js';

// Changes when the file's structure changes
const VERSIONE_FORMATO = 1;

/** The Utente columns that go into the file */
export const CAMPI_PROFILO = [
  'id', 'email', 'nome', 'ruolo', 'stato', 'dataRegistrazione', 'emailVerificata', 'ultimoAccesso',
  'immagineProfilo', 'dataNascita', 'pesoKg', 'altezzaCm', 'genere', 'bio', 'obiettivoFitness',
  'preferenzeVisibilita', 'lingua', 'linguaApp', 'fusoOrario', 'profiloCompletato', 'gamificationAttiva', 'puntiEsperienza',
  'ruoloRichiesto', 'accettazioneToS', 'accettazionePrivacy', 'consensoCookie', 'chatRetentionGiorni',
  'specializzazioni', 'anniEsperienza', 'certificazioni', 'contattoPubblico', 'tariffaIndicativa',
  'dataResetStatistiche', 'dataResetGamification'
];

/** The Utente columns left out, and why */
export const CAMPI_RISERVATI = {
  passwordHash: 'secret',
  tokenVerificaEmail: 'secret',
  tokenVerificaScadenza: 'only used by the verification token',
  tokenResetPassword: 'secret',
  tokenResetScadenza: 'only used by the reset token',
  palestraId: "replaced by the gym's data"
};

// Profile fields saved as JSON text: in the file they become objects again
const CAMPI_JSON = ['preferenzeVisibilita', 'consensoCookie', 'specializzazioni'];

// How an exercise appears everywhere in the file
const ESERCIZIO = { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } };
// Another user appears only by name
const SOLO_NOME = { select: { nome: true } };

function leggiJson(testo) {
  if (testo == null) return null;
  try { return JSON.parse(testo); } catch { return testo; }
}

const nomeDi = utente => utente?.nome ?? null;

/** All of the user's data, ready for JSON.stringify */
export async function esportaDatiUtente(utenteId) {
  const doveUtente = { where: { utenteId } };

  const [
    utente, schede, sessioni, recordPersonali, misurazioni, pianificazione, notifiche,
    partecipazioni, conversazioniAI, suggerimenti, richiesteInviate, richiesteRicevute,
    iscrizioni, appuntamentiCliente, annunciRicevuti,
    clienti, appuntamentiTrainer, annunciPubblicati, schedeAssegnate, dispositivi, passkey, preferiti, schedePreferite, notifichePush
  ] = await Promise.all([
    prisma.utente.findUnique({
      where: { id: utenteId },
      select: {
        ...Object.fromEntries(CAMPI_PROFILO.map(campo => [campo, true])),
        palestra: { select: { nomeCatena: true, citta: true, indirizzo: true, nazione: true } },
        collegamentoTelegram: { select: { telegramChatId: true, collegatoIl: true } }
      }
    }),
    prisma.schedaAllenamento.findMany({
      where: { creatoreId: utenteId },
      orderBy: { creatoIl: 'asc' },
      include: {
        assegnataDaPT: SOLO_NOME,
        esercizi: { orderBy: { ordineEsecuzione: 'asc' }, include: { esercizio: ESERCIZIO } }
      }
    }),
    prisma.sessioneAllenamento.findMany({
      ...doveUtente,
      orderBy: { dataInizio: 'asc' },
      include: {
        scheda: { select: { titolo: true } },
        logSerie: { orderBy: [{ esercizioId: 'asc' }, { serieNumero: 'asc' }], include: { esercizio: ESERCIZIO } }
      }
    }),
    prisma.recordPersonale.findMany({ ...doveUtente, orderBy: { dataRecord: 'asc' }, include: { esercizio: ESERCIZIO } }),
    prisma.misurazioneCorporea.findMany({ ...doveUtente, orderBy: { data: 'asc' } }),
    prisma.allenamentoPianificato.findMany({
      ...doveUtente,
      orderBy: { data: 'asc' },
      include: { scheda: { select: { titolo: true } }, creatoDa: SOLO_NOME }
    }),
    prisma.allenamentoNotifica.findMany({ ...doveUtente, orderBy: { creatoIl: 'asc' } }),
    prisma.partecipanteChat.findMany({
      ...doveUtente,
      include: {
        conversazione: {
          include: {
            partecipanti: { include: { utente: SOLO_NOME } },
            messaggi: { orderBy: { inviatoIl: 'asc' }, include: { mittente: SOLO_NOME } }
          }
        }
      }
    }),
    prisma.conversazioneAI.findMany({
      ...doveUtente,
      orderBy: { creatoIl: 'asc' },
      include: { messaggi: { orderBy: { inviatoIl: 'asc' } } }
    }),
    prisma.suggerimentoEsercizio.findMany({ ...doveUtente, orderBy: { creatoIl: 'asc' }, include: { esercizio: ESERCIZIO } }),
    prisma.richiestaContatto.findMany({ where: { mittenteId: utenteId }, include: { destinatario: SOLO_NOME } }),
    prisma.richiestaContatto.findMany({ where: { destinatarioId: utenteId }, include: { mittente: SOLO_NOME } }),
    // The personal trainer's notes on the client are the trainer's own: they go in the trainer's file, not here
    prisma.iscrizionePT.findMany({ ...doveUtente, omit: { notePT: true }, include: { trainer: SOLO_NOME } }),
    prisma.appuntamentoPT.findMany({ where: { clienteId: utenteId }, orderBy: { dataOra: 'asc' }, include: { trainer: SOLO_NOME } }),
    prisma.annuncioPT.findMany({ where: { destinatarioId: utenteId }, orderBy: { creatoIl: 'asc' }, include: { trainer: SOLO_NOME } }),
    prisma.iscrizionePT.findMany({ where: { trainerId: utenteId }, include: { utente: SOLO_NOME } }),
    prisma.appuntamentoPT.findMany({ where: { trainerId: utenteId }, orderBy: { dataOra: 'asc' }, include: { cliente: SOLO_NOME } }),
    prisma.annuncioPT.findMany({ where: { trainerId: utenteId }, orderBy: { creatoIl: 'asc' }, include: { destinatario: SOLO_NOME } }),
    prisma.schedaAllenamento.findMany({
      where: { assegnataDaPTId: utenteId },
      orderBy: { creatoIl: 'asc' },
      select: { id: true, titolo: true, creatoIl: true, creatore: SOLO_NOME }
    }),
    // The open sessions, without the tokens: only where from and when
    prisma.refreshToken.findMany({
      where: { utenteId, revocato: false },
      orderBy: { iniziataIl: 'asc' },
      select: { dispositivo: true, iniziataIl: true, creato: true, scadenza: true }
    }),
    // The passkeys, without keys: only name and dates
    prisma.passkey.findMany({
      where: { utenteId },
      orderBy: { creataIl: 'asc' },
      select: { nome: true, sincronizzata: true, creataIl: true, ultimoUso: true }
    }),
    prisma.esercizioPreferito.findMany({
      where: { utenteId },
      orderBy: { creatoIl: 'asc' },
      select: { creatoIl: true, esercizio: ESERCIZIO }
    }),
    prisma.schedaPreferita.findMany({
      where: { utenteId },
      orderBy: { creatoIl: 'asc' },
      select: { creatoIl: true, scheda: { select: { id: true, titolo: true } } }
    }),
    // The devices that receive push notifications, without the subscription (endpoint and keys)
    prisma.iscrizionePush.findMany({
      where: { utenteId },
      orderBy: { creataIl: 'asc' },
      select: { dispositivo: true, creataIl: true }
    })
  ]);

  const { palestra, collegamentoTelegram, ...campi } = utente;
  const profilo = {
    ...campi,
    ...Object.fromEntries(CAMPI_JSON.map(campo => [campo, leggiJson(campi[campo])])),
    palestra,
    // The Telegram chat id is a BigInt, which JSON cannot write
    telegram: collegamentoTelegram && {
      collegatoIl: collegamentoTelegram.collegatoIl,
      chatId: collegamentoTelegram.telegramChatId?.toString() ?? null
    }
  };

  return {
    formato: 'gymmaster-esportazione-dati',
    versioneFormato: VERSIONE_FORMATO,
    esportatoIl: new Date().toISOString(),
    // In the language of the request that asked for the file
    nota: t('esportazioneDatiService.nota'),
    profilo,
    schede: schede.map(({ assegnataDaPT, ...scheda }) => ({ ...scheda, assegnataDa: nomeDi(assegnataDaPT) })),
    allenamenti: sessioni.map(({ scheda, logSerie, ...sessione }) => ({
      ...sessione, scheda: scheda.titolo, serie: logSerie
    })),
    recordPersonali,
    misurazioni,
    pianificazione: pianificazione.map(({ scheda, creatoDa, ...voce }) => ({
      ...voce, scheda: scheda.titolo, programmatoDa: nomeDi(creatoDa)
    })),
    notifiche,
    chat: partecipazioni.map(({ conversazione }) => ({
      id: conversazione.id,
      tipo: conversazione.tipo,
      creatoIl: conversazione.creatoIl,
      partecipanti: conversazione.partecipanti.map(p => p.utente.nome),
      messaggi: conversazione.messaggi.map(m => ({
        mittente: m.mittente.nome,
        tuo: m.mittenteId === utenteId,
        contenuto: m.contenuto,
        inviatoIl: m.inviatoIl,
        letto: m.letto
      }))
    })),
    assistente: conversazioniAI,
    suggerimentiEsercizi: suggerimenti,
    eserciziPreferiti: preferiti.map(({ esercizio, creatoIl }) => ({ ...esercizio, aggiuntoIl: creatoIl })),
    schedePreferite: schedePreferite.map(({ scheda, creatoIl }) => ({ ...scheda, aggiuntaIl: creatoIl })),
    dispositivi: dispositivi.map(({ creato, ...d }) => ({ ...d, ultimoUso: creato })),
    passkey,
    notifichePush,
    richiesteContatto: {
      inviate: richiesteInviate.map(({ destinatario, ...r }) => ({ ...r, a: destinatario.nome })),
      ricevute: richiesteRicevute.map(({ mittente, ...r }) => ({ ...r, da: mittente.nome }))
    },
    personalTrainer: {
      iscrizioni: iscrizioni.map(({ trainer, ...i }) => ({ ...i, trainer: trainer.nome })),
      appuntamenti: appuntamentiCliente.map(({ trainer, ...a }) => ({ ...a, trainer: trainer.nome })),
      annunciRicevuti: annunciRicevuti.map(({ trainer, ...a }) => ({ ...a, trainer: trainer.nome }))
    },
    comePersonalTrainer: {
      clienti: clienti.map(({ utente: cliente, ...i }) => ({ ...i, cliente: cliente.nome })),
      appuntamenti: appuntamentiTrainer.map(({ cliente, ...a }) => ({ ...a, cliente: cliente.nome })),
      annunci: annunciPubblicati.map(({ destinatario, ...a }) => ({ ...a, destinatario: nomeDi(destinatario) })),
      schedeAssegnate: schedeAssegnate.map(({ creatore, ...s }) => ({ ...s, cliente: creatore.nome }))
    }
  };
}

/** File name: gymmaster-dati-2026-10-10.json, with the Copenhagen day */
export function nomeFileEsportazione(adesso = new Date()) {
  return `gymmaster-dati-${giornoLocale(adesso).toISOString().slice(0, 10)}.json`;
}
