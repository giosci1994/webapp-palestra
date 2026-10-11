// ============================================
// GymMaster — Riscaldamento e drop set
// ============================================
//
// Le stesse regole del server (backend/src/utils/tipiSerie.js):
// - riscaldamento: prima delle serie di lavoro; si vede, ma resta fuori da
//   volume, conteggi, record e progressione;
// - drop: subito dopo una serie di lavoro, a peso calato e senza recupero;
//   conta nel volume ma non come serie a se'.

/** Una serie di lavoro? Senza tipo (salvate prima che ci fosse) lo e' */
export const diLavoro = s => (s?.tipo ?? 'LAVORO') === 'LAVORO';

/** Il volume (kg × ripetizioni) delle serie, riscaldamento escluso */
export const volumeDi = serie => serie
  .filter(s => s.tipo !== 'RISCALDAMENTO')
  .reduce((somma, s) => somma + (s.pesoEffettivo || 0) * (s.repEffettive || 0), 0);

const posto = s => (s.tipo === 'RISCALDAMENTO' ? [0, s.serieNumero ?? 0, 0] : [1, s.serieNumero ?? 0, s.tipo === 'DROP' ? 1 : 0]);

/**
 * Le serie di un esercizio nell'ordine in cui mostrarle: prima il
 * riscaldamento, poi ogni serie di lavoro seguita dai suoi drop. A parita'
 * resta l'ordine di arrivo.
 */
export function ordinaSerie(serie) {
  return serie
    .map((s, i) => ({ s, i, p: posto(s) }))
    .sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1] || a.p[2] - b.p[2] || a.i - b.i)
    .map(x => x.s);
}

/** Percentuali del peso di lavoro e ripetizioni della rampa di riscaldamento */
export const RAMPA = [
  { quota: 0.4, rep: 10 },
  { quota: 0.6, rep: 5 },
  { quota: 0.8, rep: 3 }
];

const arrotondaA = (peso, gradino) => Math.round(Math.round(peso / gradino) * gradino * 100) / 100;

/**
 * La rampa di riscaldamento verso il peso di lavoro: 40%×10, 60%×5, 80%×3,
 * arrotondati al gradino dell'attrezzo e mai sotto il minimo (la barra
 * vuota). Toglie i passi doppi e quelli che arrivano al peso di lavoro.
 * @param {number} pesoLavoro
 * @param {{ incremento?: number, minimo?: number }} [opzioni]
 * @returns {{ peso: number, rep: number }[]} vuota se il peso e' troppo leggero per scaldarsi
 */
export function rampaRiscaldamento(pesoLavoro, { incremento = 2.5, minimo = 0 } = {}) {
  const lavoro = Number(pesoLavoro);
  if (!(lavoro > 0) || !(incremento > 0)) return [];
  const rampa = [];
  for (const { quota, rep } of RAMPA) {
    const peso = Math.max(minimo, arrotondaA(lavoro * quota, incremento));
    if (peso <= 0 || peso >= lavoro || rampa.some(p => p.peso === peso)) continue;
    rampa.push({ peso, rep });
  }
  return rampa;
}

/**
 * Il peso proposto per un drop: un quinto in meno, al gradino dell'attrezzo
 * (almeno un gradino sotto); null se non si puo' calare.
 */
export function pesoDrop(peso, incremento = 2.5) {
  const prima = Number(peso);
  if (!(prima > 0) || !(incremento > 0)) return null;
  let calato = arrotondaA(prima * 0.8, incremento);
  if (calato >= prima) calato = arrotondaA(prima - incremento, incremento);
  return calato > 0 ? calato : null;
}
