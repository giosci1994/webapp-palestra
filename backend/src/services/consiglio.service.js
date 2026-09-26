// ============================================
// GymMaster — Consiglio sulla scheda da fare
// ============================================
//
// Fra le schede disponibili sceglie quella che allena meglio i muscoli
// riposati senza caricare quelli ancora in recupero, e spiega il perché con
// gli stessi gruppi e le stesse 48 ore della sezione Corpo delle statistiche.
//
// Prima il consiglio nasceva in dashboard da un elenco fisso di gruppi
// ("Dorso", "Gambe", "Addome"…) che il catalogo non usa: "Dorso" risultava
// sempre mai allenato, nessuna scheda lo conteneva e si ripiegava sulla prima
// della lista, con un testo che non c'entrava nulla con la scheda proposta.

import prisma from '../config/database.js';
import { gruppiDiEsercizio, GRUPPI_NON_MUSCOLARI, GRUPPI_PRINCIPALI } from '../utils/gruppiMuscolari.js';
import { giornoLocale, giorniDiCalendario } from '../utils/date.js';

const ORE_RECUPERO = 48;
const GIORNI_PIANO = 7;
// Il testo va nel banner della dashboard, che ne mostra due righe: oltre
// questa lunghezza la seconda frase si perde e con lei il motivo principale
const MAX_TESTO = 70;

// Quanto pesa ogni gruppo nel consiglio: prima i grandi gruppi, poi le
// braccia, poi i muscoli piccoli. Senza questa scala una scheda per tibiali e
// adduttori, mai allenati, passerebbe davanti a quella per il petto.
const IMPORTANZA = {
  Petto: 1, Schiena: 1, Spalle: 1, Quadricipiti: 1, Femorali: 1, Glutei: 1,
  Bicipiti: 0.8, Tricipiti: 0.8,
  Addominali: 0.5, Polpacci: 0.5, Trapezio: 0.5, Avambracci: 0.4,
};
const IMPORTANZA_MINORE = 0.3;

// Nomi da accordare al singolare: "il petto riposa", "i glutei riposano"
const SINGOLARI = new Set(['Petto', 'Schiena', 'Trapezio']);
const GIORNI_SETTIMANA = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const importanza = (gruppo) => IMPORTANZA[gruppo] ?? IMPORTANZA_MINORE;

/**
 * Bisogno di allenare un gruppo: -1 se ancora in recupero, poi cresce con i
 * giorni di riposo fino a 1 (fermo da due settimane o mai allenato).
 */
export function bisogno(ultima, adesso) {
  if (!ultima) return 1;
  if (adesso - ultima < ORE_RECUPERO * 3600000) return -1;
  const giorni = giorniDiCalendario(ultima, adesso);
  if (giorni < 4) return 0.3;
  if (giorni < 7) return 0.6;
  if (giorni < 14) return 0.85;
  return 1;
}

/**
 * Serie in programma per gruppo, pesate come nelle statistiche (secondari a
 * metà), e a parte quelle dirette: solo queste dicono di cosa parla la scheda.
 */
export function seriePerGruppo(esercizi) {
  const perGruppo = new Map();
  const diretti = new Map();
  let totale = 0;
  for (const e of esercizi) {
    const serie = e.serieTarget || 1;
    totale += serie;
    for (const { gruppo, peso, secondario } of gruppiDiEsercizio(e.esercizio.gruppoMuscoloPrimario, e.esercizio.gruppoMuscoloSecondario)) {
      if (GRUPPI_NON_MUSCOLARI.has(gruppo)) continue;
      perGruppo.set(gruppo, (perGruppo.get(gruppo) || 0) + serie * peso);
      if (!secondario) diretti.set(gruppo, (diretti.get(gruppo) || 0) + serie * peso);
    }
  }
  return { perGruppo, diretti, totale };
}

/** I gruppi su cui una scheda lavora di più, per descriverla in poche parole. */
export function gruppiDellaScheda(esercizi, quanti = 3) {
  return [...seriePerGruppo(esercizi).diretti]
    .sort((a, b) => b[1] - a[1] || posizione(a[0]) - posizione(b[0]))
    .slice(0, quanti)
    .map(([gruppo]) => gruppo);
}

/**
 * Quanto una scheda serve adesso: media, per serie in programma, del bisogno
 * dei gruppi che allena. Negativa se lavora soprattutto muscoli in recupero.
 */
export function valutaScheda(esercizi, ultimaDiretta, adesso) {
  const { perGruppo, diretti, totale } = seriePerGruppo(esercizi);
  const contributi = [...perGruppo].map(([gruppo, serie]) => {
    const b = bisogno(ultimaDiretta.get(gruppo), adesso);
    return { gruppo, serie, dirette: diretti.get(gruppo) || 0, bisogno: b, contributo: serie * importanza(gruppo) * b };
  });
  const somma = contributi.reduce((s, c) => s + c.contributo, 0);
  return { punteggio: totale ? somma / totale : 0, contributi };
}

const elenco = (nomi) => nomi.length < 2 ? nomi.join('') : `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}`;
// Scelti i gruppi da nominare, si elencano nell'ordine abituale: "Petto e
// Spalle", come nei titoli delle schede, non "Spalle e Petto"
const posizione = (gruppo) => { const i = GRUPPI_PRINCIPALI.indexOf(gruppo); return i < 0 ? GRUPPI_PRINCIPALI.length : i; };
const inOrdine = (nomi) => [...nomi].sort((a, b) => posizione(a) - posizione(b));
const plurale = (nomi) => nomi.length > 1 || !SINGOLARI.has(nomi[0]);
const verbo = (nomi, singolare, pluralePer) => plurale(nomi) ? pluralePer : singolare;

/** "Petto e Spalle riposano da 5 giorni" — i gruppi riposati che la scheda allena di più. */
function fraseRiposati(riposati, ultimaDiretta, adesso) {
  const nomi = inOrdine(riposati.map(c => c.gruppo));
  const giorni = nomi.map(g => ultimaDiretta.get(g)).filter(Boolean).map(d => giorniDiCalendario(d, adesso));
  if (giorni.length === 0) return `Non hai ancora allenato ${elenco(nomi)}`;
  const minimo = Math.min(...giorni);
  const riposa = verbo(nomi, 'riposa', 'riposano');
  if (minimo >= 14) return `${elenco(nomi)} ${riposa} da più di due settimane`;
  const almeno = giorni.length < nomi.length || giorni.some(g => g !== minimo) ? 'almeno ' : '';
  return `${elenco(nomi)} ${riposa} da ${almeno}${minimo} giorni`;
}

/** "domani", "dopodomani" o il giorno della settimana, per un piano entro sette giorni. */
function quando(data, oggi) {
  const giorni = Math.round((data - oggi) / 86400000);
  if (giorni === 1) return 'domani';
  if (giorni === 2) return 'dopodomani';
  return GIORNI_SETTIMANA[data.getUTCDay()];
}

/**
 * Il consiglio per la dashboard.
 *
 * @returns {Promise<null | {
 *   motivo: 'oggi' | 'riposati' | 'inizio' | 'riposo',
 *   scheda: { id: number, titolo: string } | null,
 *   testo: string
 * }>} null se l'utente non ha schede da proporre.
 */
export async function consiglioAllenamento(utenteId, adesso = new Date()) {
  const oggi = giornoLocale(adesso);
  const utente = await prisma.utente.findUnique({ where: { id: utenteId }, select: { dataResetStatistiche: true } });
  const inizioStoria = utente?.dataResetStatistiche || new Date(0);
  const selezioneEsercizi = {
    select: { serieTarget: true, esercizio: { select: { gruppoMuscoloPrimario: true, gruppoMuscoloSecondario: true } } }
  };

  const [serie, pianiFatti, piani, sessioniPerScheda, schede] = await Promise.all([
    prisma.logSerie.findMany({
      where: { completato: true, sessione: { utenteId, dataInizio: { gte: inizioStoria, lte: adesso } } },
      select: {
        esercizio: { select: { gruppoMuscoloPrimario: true, gruppoMuscoloSecondario: true } },
        sessione: { select: { dataInizio: true } }
      }
    }),
    // Un allenamento segnato come fatto dal calendario, senza sessione
    // registrata (per esempio fatto offline), conta come la sua scheda
    prisma.allenamentoPianificato.findMany({
      where: { utenteId, stato: 'COMPLETATO', sessioneId: null, data: { gte: giornoLocale(inizioStoria), lte: oggi } },
      select: { data: true, scheda: { select: { esercizi: selezioneEsercizi } } }
    }),
    prisma.allenamentoPianificato.findMany({
      where: { utenteId },
      select: { schedaId: true, data: true, stato: true },
      orderBy: [{ data: 'asc' }, { id: 'asc' }]
    }),
    prisma.sessioneAllenamento.groupBy({ by: ['schedaId'], where: { utenteId }, _count: true }),
    // Le stesse schede di "Allenati ora", piu' quelle assegnate dal PT
    prisma.schedaAllenamento.findMany({
      where: { OR: [{ creatoreId: utenteId }, { visibilita: 'GLOBALE' }] },
      select: { id: true, titolo: true, creatoreId: true, esercizi: selezioneEsercizi }
    })
  ]);

  const candidate = schede.filter(s => s.esercizi.length > 0);
  if (candidate.length === 0) return null;

  // Ultimo allenamento diretto (gruppo primario) di ogni gruppo, e le serie
  // delle ultime 48 ore per dire quali muscoli sono stanchi
  const ultimaDiretta = new Map();
  const serieRecenti = new Map();
  const registra = (gruppo, data, peso) => {
    if (!ultimaDiretta.has(gruppo) || data > ultimaDiretta.get(gruppo)) ultimaDiretta.set(gruppo, data);
    if (adesso - data < ORE_RECUPERO * 3600000) serieRecenti.set(gruppo, (serieRecenti.get(gruppo) || 0) + peso);
  };
  for (const s of serie) {
    for (const { gruppo, peso, secondario } of gruppiDiEsercizio(s.esercizio.gruppoMuscoloPrimario, s.esercizio.gruppoMuscoloSecondario)) {
      if (!secondario) registra(gruppo, s.sessione.dataInizio, peso);
    }
  }
  for (const p of pianiFatti) {
    // Del giorno si sa solo la data: mezzogiorno locale e' un'ora plausibile
    const data = new Date(p.data.getTime() + 10 * 3600000);
    if (data > adesso) continue;
    for (const e of p.scheda.esercizi) {
      for (const { gruppo, peso, secondario } of gruppiDiEsercizio(e.esercizio.gruppoMuscoloPrimario, e.esercizio.gruppoMuscoloSecondario)) {
        if (!secondario) registra(gruppo, data, (e.serieTarget || 1) * peso);
      }
    }
  }

  const inRecupero = [...serieRecenti]
    .filter(([gruppo]) => !GRUPPI_NON_MUSCOLARI.has(gruppo) && importanza(gruppo) >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([gruppo]) => gruppo);
  const fraseRecupero = (nomi) => `${elenco(inOrdine(nomi))} ${verbo(nomi, 'recupera', 'recuperano')} ancora`;

  const valutata = (s) => ({ scheda: s, ...valutaScheda(s.esercizi, ultimaDiretta, adesso) });
  const riposatiDi = (v) => v.contributi
    .filter(c => c.bisogno > 0)
    .sort((a, b) => b.contributo - a.contributo)
    .slice(0, 2);

  // 1. Il calendario viene prima di tutto: l'ha deciso l'utente (o il suo PT)
  const pianoDiOggi = piani.find(p => p.stato === 'PIANIFICATO' && p.data.getTime() === oggi.getTime());
  const schedaDiOggi = pianoDiOggi && candidate.find(s => s.id === pianoDiOggi.schedaId);
  if (schedaDiOggi) {
    const v = valutata(schedaDiOggi);
    const riposati = riposatiDi(v);
    // L'avviso vale per i muscoli che la scheda allena davvero, non per chi
    // collabora di rimbalzo in un paio di esercizi
    const stanchi = v.contributi.filter(c => c.bisogno < 0 && c.dirette >= 2 && importanza(c.gruppo) >= 0.5)
      .sort((a, b) => b.dirette - a.dirette).slice(0, 2).map(c => c.gruppo);
    let testo = 'In programma oggi.';
    if (stanchi.length) testo += ` Attenzione: ${fraseRecupero(stanchi)}.`;
    else if (riposati.length) testo += ` ${fraseRiposati(riposati, ultimaDiretta, adesso)}.`;
    return { motivo: 'oggi', scheda: { id: schedaDiOggi.id, titolo: schedaDiOggi.titolo }, testo };
  }

  // 2. Altrimenti la scheda migliore, preferendo quelle che l'utente usa gia'
  const usate = new Set([...sessioniPerScheda.map(s => s.schedaId), ...piani.map(p => p.schedaId)]);
  const familiarita = (s) => usate.has(s.id) ? 1 : s.creatoreId === utenteId ? 0.9 : 0.75;
  const classifica = candidate
    .map(valutata)
    .map(v => ({ ...v, voto: v.punteggio > 0 ? v.punteggio * familiarita(v.scheda) : v.punteggio }))
    .sort((a, b) => b.voto - a.voto || a.scheda.id - b.scheda.id);
  const migliore = classifica[0];

  // Nessuna scheda serve senza caricare muscoli stanchi
  if (migliore.voto <= 0) {
    const stanchi = inRecupero.slice(0, 2);
    return {
      motivo: 'riposo',
      scheda: null,
      testo: stanchi.length
        ? `${elenco(inOrdine(stanchi))} ${verbo(stanchi, 'è', 'sono')} ancora in recupero: oggi riposa.`
        : 'Ogni scheda caricherebbe muscoli ancora in recupero: oggi riposa.'
    };
  }

  const scheda = { id: migliore.scheda.id, titolo: migliore.scheda.titolo };
  if (ultimaDiretta.size === 0) {
    const principali = gruppiDellaScheda(migliore.scheda.esercizi);
    return { motivo: 'inizio', scheda, testo: `Per cominciare: una scheda per ${elenco(inOrdine(principali))}.` };
  }

  const motivo = `${fraseRiposati(riposatiDi(migliore), ultimaDiretta, adesso)}.`;
  const prossimoPiano = piani.find(p =>
    p.stato === 'PIANIFICATO' && p.schedaId === scheda.id &&
    p.data > oggi && p.data - oggi <= GIORNI_PIANO * 86400000);
  // Dei muscoli stanchi si nominano solo quelli che la scheda proposta non tocca
  const gruppiScheda = new Set(migliore.contributi.map(c => c.gruppo));
  const risparmiati = inRecupero.filter(g => !gruppiScheda.has(g)).slice(0, 2);
  const aggiunta = prossimoPiano ? `In programma ${quando(prossimoPiano.data, oggi)}.`
    : risparmiati.length ? `${fraseRecupero(risparmiati)}.`
    : '';
  const testo = aggiunta && motivo.length + 1 + aggiunta.length <= MAX_TESTO ? `${motivo} ${aggiunta}` : motivo;

  return { motivo: 'riposati', scheda, testo };
}
