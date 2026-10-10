// ============================================
// GymMaster — Esportazione Dati
// Copia completa dei dati di un utente
// ============================================
//
// Il diritto di accesso e quello alla portabilita' (GDPR, art. 15 e 20) che
// la privacy policy promette: tutto cio' che GymMaster conserva su una
// persona, in un file JSON che qualunque programma sa leggere.
//
// Due regole:
// - niente segreti: hash della password, token di sessione, di verifica e di
//   reset, codice di collegamento a Telegram;
// - degli altri utenti solo il nome. Le chat contengono anche i messaggi
//   ricevuti, perche' una conversazione a meta' non serve a niente, ma email
//   e profilo degli interlocutori sono dati loro.
//
// Dei modelli senza segreti si esportano tutti i campi, cosi' una colonna
// aggiunta domani entra da sola nel file. Il profilo invece va elencato campo
// per campo (CAMPI_PROFILO / CAMPI_RISERVATI), e un test controlla che ogni
// colonna di Utente stia in uno dei due elenchi.

import prisma from '../config/database.js';
import { giornoLocale } from '../utils/date.js';

// Cambia se cambia la struttura del file
export const VERSIONE_FORMATO = 1;

/** Le colonne di Utente che finiscono nel file */
export const CAMPI_PROFILO = [
  'id', 'email', 'nome', 'ruolo', 'stato', 'dataRegistrazione', 'emailVerificata', 'ultimoAccesso',
  'immagineProfilo', 'dataNascita', 'pesoKg', 'altezzaCm', 'genere', 'bio', 'obiettivoFitness',
  'preferenzeVisibilita', 'profiloCompletato', 'gamificationAttiva', 'puntiEsperienza',
  'ruoloRichiesto', 'accettazioneToS', 'accettazionePrivacy', 'consensoCookie', 'chatRetentionGiorni',
  'specializzazioni', 'anniEsperienza', 'certificazioni', 'contattoPubblico', 'tariffaIndicativa',
  'dataResetStatistiche', 'dataResetGamification'
];

/** Le colonne di Utente che restano fuori, e perche' */
export const CAMPI_RISERVATI = {
  passwordHash: 'segreto',
  tokenVerificaEmail: 'segreto',
  tokenVerificaScadenza: 'serve solo al token di verifica',
  tokenResetPassword: 'segreto',
  tokenResetScadenza: 'serve solo al token di reset',
  palestraId: 'sostituito dai dati della palestra'
};

// Campi del profilo salvati come testo JSON: nel file tornano oggetti
const CAMPI_JSON = ['preferenzeVisibilita', 'consensoCookie', 'specializzazioni'];

// Come compare un esercizio ovunque nel file
const ESERCIZIO = { select: { nome: true, nomeIt: true, gruppoMuscoloPrimario: true } };
// Un altro utente compare solo per nome
const SOLO_NOME = { select: { nome: true } };

function leggiJson(testo) {
  if (testo == null) return null;
  try { return JSON.parse(testo); } catch { return testo; }
}

const nomeDi = utente => utente?.nome ?? null;

/** Tutti i dati dell'utente, pronti per JSON.stringify */
export async function esportaDatiUtente(utenteId) {
  const doveUtente = { where: { utenteId } };

  const [
    utente, schede, sessioni, recordPersonali, misurazioni, pianificazione, notifiche,
    partecipazioni, conversazioniAI, suggerimenti, richiesteInviate, richiesteRicevute,
    iscrizioni, appuntamentiCliente, annunciRicevuti,
    clienti, appuntamentiTrainer, annunciPubblicati, schedeAssegnate
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
    // Le note del PT sul cliente sono appunti del PT: finiscono nel suo file, non qui
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
    })
  ]);

  const { palestra, collegamentoTelegram, ...campi } = utente;
  const profilo = {
    ...campi,
    ...Object.fromEntries(CAMPI_JSON.map(campo => [campo, leggiJson(campi[campo])])),
    palestra,
    // L'id della chat Telegram e' un BigInt, che JSON non sa scrivere
    telegram: collegamentoTelegram && {
      collegatoIl: collegamentoTelegram.collegatoIl,
      chatId: collegamentoTelegram.telegramChatId?.toString() ?? null
    }
  };

  return {
    formato: 'gymmaster-esportazione-dati',
    versioneFormato: VERSIONE_FORMATO,
    esportatoIl: new Date().toISOString(),
    nota: 'Tutti i dati che GymMaster conserva sul tuo account. Degli altri utenti compare solo il nome.',
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

/** Nome del file: gymmaster-dati-2026-10-10.json, col giorno di Copenaghen */
export function nomeFileEsportazione(adesso = new Date()) {
  return `gymmaster-dati-${giornoLocale(adesso).toISOString().slice(0, 10)}.json`;
}
