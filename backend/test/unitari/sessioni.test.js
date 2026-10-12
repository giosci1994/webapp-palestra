// The pure functions behind correcting a workout from the history and logging
// a past one: reading the values from the client and the history format.
import { describe, it as prova } from 'node:test';
import assert from 'node:assert/strict';
import {
  leggiValoriSerie, leggiInizio, leggiDurata, formattaPerStorico, eserciziDaSessione, orarioDalTelefono
} from '../../src/controllers/sessioni.controller.js';
import { ErroreValidazione } from '../../src/utils/errori.js';
import { conLingua } from '../../src/i18n/index.js';

// Outside a request the server speaks English: these tests check the
// Italian messages, so each one runs as a request in Italian would
const it = (nome, corpo) => prova(nome, () => conLingua('it', corpo));

const MINUTO = 60 * 1000;

/** For assert.throws: an ErroreValidazione with exactly this message */
const erroreValidazione = messaggio => errore => {
  assert.ok(errore instanceof ErroreValidazione, `atteso un ErroreValidazione, arrivato: ${errore}`);
  assert.equal(errore.message, messaggio);
  return true;
};

describe('leggiValoriSerie', () => {
  it("un campo assente resta com'era: non compare fra i valori", () => {
    assert.deepEqual(leggiValoriSerie({ id: 7 }, 1), {});
  });

  it('accetta numeri e stringhe numeriche', () => {
    assert.deepEqual(
      leggiValoriSerie({ pesoEffettivo: '82.5', repEffettive: 8, rpe: '9' }, 1),
      { pesoEffettivo: 82.5, repEffettive: 8, rpe: 9 }
    );
  });

  it('peso e ripetizioni vuoti valgono 0, come nel corpo libero', () => {
    assert.deepEqual(
      leggiValoriSerie({ pesoEffettivo: '', repEffettive: null }, 1),
      { pesoEffettivo: 0, repEffettive: 0 }
    );
  });

  it('RPE, durata e livello vuoti si svuotano', () => {
    assert.deepEqual(
      leggiValoriSerie({ rpe: '', durataMinuti: null, livelloResistenza: '' }, 1),
      { rpe: null, durataMinuti: null, livelloResistenza: null }
    );
  });

  it('rifiuta i valori fuori scala dicendo di quale serie si tratta', () => {
    const casi = [
      [{ pesoEffettivo: -5 }, 'Serie 3: peso non valido'],
      [{ pesoEffettivo: 1001 }, 'Serie 3: peso non valido'],
      [{ pesoEffettivo: 'tanto' }, 'Serie 3: peso non valido'],
      [{ repEffettive: 8.5 }, 'Serie 3: ripetizioni non valide'],
      [{ rpe: 0 }, 'Serie 3: RPE non valido (da 1 a 10)'],
      [{ rpe: 11 }, 'Serie 3: RPE non valido (da 1 a 10)'],
      [{ rpe: 7.5 }, 'Serie 3: RPE non valido (da 1 a 10)'],
      [{ durataMinuti: 601 }, 'Serie 3: durata non valida'],
      [{ livelloResistenza: -1 }, 'Serie 3: livello non valido']
    ];
    for (const [riga, messaggio] of casi) {
      assert.throws(() => leggiValoriSerie(riga, 3), erroreValidazione(messaggio), JSON.stringify(riga));
    }
  });

  it('accetta i valori al limite', () => {
    assert.deepEqual(
      leggiValoriSerie({ pesoEffettivo: 1000, repEffettive: 0, rpe: 10, durataMinuti: 600 }, 1),
      { pesoEffettivo: 1000, repEffettive: 0, rpe: 10, durataMinuti: 600 }
    );
  });
});

describe('leggiInizio', () => {
  it("restituisce l'istante dichiarato", () => {
    const ieri = new Date(Date.now() - 24 * 60 * MINUTO);
    assert.deepEqual(leggiInizio(ieri.toISOString()), ieri);
  });

  it('rifiuta una data che non si legge', () => {
    assert.throws(() => leggiInizio('ieri sera'), erroreValidazione('Data non valida'));
  });

  it("tollera qualche minuto di scarto fra l'orologio del telefono e il server", () => {
    const fraDueMinuti = new Date(Date.now() + 2 * MINUTO);
    assert.deepEqual(leggiInizio(fraDueMinuti.toISOString()), fraDueMinuti);
  });

  it('rifiuta un inizio nel futuro', () => {
    const fraDieciMinuti = new Date(Date.now() + 10 * MINUTO).toISOString();
    assert.throws(() => leggiInizio(fraDieciMinuti), erroreValidazione('Un allenamento non può iniziare nel futuro'));
  });

  it('rifiuta un allenamento di oltre due anni fa', () => {
    const treAnniFa = new Date();
    treAnniFa.setFullYear(treAnniFa.getFullYear() - 3);
    assert.throws(
      () => leggiInizio(treAnniFa.toISOString()),
      erroreValidazione('Non puoi inserire allenamenti di più di 2 anni fa')
    );
  });
});

describe('leggiDurata', () => {
  it('accetta da 1 minuto a 10 ore, anche come stringa', () => {
    assert.equal(leggiDurata('45'), 45);
    assert.equal(leggiDurata(1), 1);
    assert.equal(leggiDurata(600), 600);
  });

  it('rifiuta durate nulle, eccessive o illeggibili', () => {
    for (const valore of [0, 601, 'tanto', null]) {
      assert.throws(
        () => leggiDurata(valore),
        erroreValidazione('La durata deve essere fra 1 e 600 minuti'),
        String(valore)
      );
    }
  });
});

describe('orarioDalTelefono', () => {
  const inizio = new Date('2026-10-11T09:00:00Z');
  const adesso = new Date('2026-10-11T12:00:00Z');

  it("restituisce l'ora del telefono, come testo o come numero", () => {
    assert.equal(orarioDalTelefono('2026-10-11T09:40:00Z', inizio, adesso).toISOString(), '2026-10-11T09:40:00.000Z');
    assert.equal(orarioDalTelefono(Date.parse('2026-10-11T10:00:00Z'), inizio, adesso).toISOString(), '2026-10-11T10:00:00.000Z');
  });

  it("un orologio avanti o indietro non la porta fuori dall'allenamento", () => {
    assert.equal(orarioDalTelefono('2026-10-11T13:00:00Z', inizio, adesso).getTime(), adesso.getTime());
    assert.equal(orarioDalTelefono('2026-10-11T08:58:00Z', inizio, adesso).getTime(), inizio.getTime());
  });

  it('rifiuta un orario che non si legge', () => {
    for (const valore of ['ieri', {}, true]) {
      assert.throws(() => orarioDalTelefono(valore, inizio, adesso), erroreValidazione('Orario non valido'));
    }
  });
});

describe('formattaPerStorico', () => {
  const panca = { id: 5, nome: 'Bench Press', nomeIt: 'Panca piana', gruppoMuscoloPrimario: 'Petto' };
  const croci = { id: 9, nome: 'Croci', nomeIt: null, gruppoMuscoloPrimario: 'Petto' };
  const serie = (id, esercizio, serieNumero, pesoEffettivo, repEffettive) => ({
    id, esercizioId: esercizio.id, esercizio, serieNumero, tipo: 'LAVORO', pesoEffettivo, repEffettive,
    rpe: null, durataMinuti: null, livelloResistenza: null, distanzaKm: null, velocitaKmh: null,
    // Log fields the history does not show
    completato: true, noteSerie: 'nota interna', sessioneId: 1
  });
  const sessione = {
    id: 1,
    dataInizio: new Date('2026-10-08T17:00:00Z'),
    dataFine: new Date('2026-10-08T18:10:00Z'),
    durataMinuti: 70,
    minutiRiscaldamento: 10,
    volumeTotaleKg: 1520,
    noteFinali: 'Buona',
    utenteId: 3,
    scheda: { id: 4, titolo: 'Push', esercizi: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    _count: { logSerie: 3 },
    // As the history query orders them: by exercise, then by number
    logSerie: [serie(10, panca, 1, 80, 8), serie(11, panca, 2, 80, 7), serie(12, croci, 1, 20, 12)]
  };

  it('raggruppa le serie per esercizio, con i soli campi che lo storico mostra', () => {
    const { esercizi } = formattaPerStorico(sessione);
    assert.equal(esercizi.length, 2);
    assert.deepEqual(esercizi[0].esercizio, panca);
    assert.deepEqual(esercizi[0].serie.map(s => s.id), [10, 11]);
    assert.deepEqual(esercizi[1].serie[0], {
      id: 12, serieNumero: 1, tipo: 'LAVORO', pesoEffettivo: 20, repEffettive: 12,
      rpe: null, durataMinuti: null, livelloResistenza: null, distanzaKm: null, velocitaKmh: null
    });
  });

  it('riassume la sessione e conta gli esercizi della scheda', () => {
    const { esercizi, ...riassunto } = formattaPerStorico(sessione);
    assert.ok(esercizi);
    assert.deepEqual(riassunto, {
      id: 1,
      dataInizio: sessione.dataInizio,
      dataFine: sessione.dataFine,
      durataMinuti: 70,
      minutiRiscaldamento: 10,
      volumeTotaleKg: 1520,
      noteFinali: 'Buona',
      scheda: { id: 4, titolo: 'Push', numEsercizi: 3 },
      serieCompletate: 3
    });
  });
});

describe('eserciziDaSessione', () => {
  let prossimoId = 0;
  const serie = (esercizioId, repEffettive, altro = {}) =>
    ({ id: ++prossimoId, esercizioId, repEffettive, pesoEffettivo: 50, completato: true, ...altro });

  it("gli esercizi nell'ordine in cui li hai cominciati, con le serie fatte e le ripetizioni", () => {
    const esercizi = eserciziDaSessione([
      serie(7, 10), serie(7, 10), serie(3, 12), serie(7, 10), serie(3, 8), serie(3, 10)
    ]);
    assert.deepEqual(esercizi.map(e => [e.esercizioId, e.ordineEsecuzione, e.serieTarget, e.repTarget]), [
      [7, 1, 3, '10'],
      [3, 2, 3, '8-12']
    ]);
  });

  it("l'ordine segue le serie registrate, anche se arrivano mescolate", () => {
    const [a, b] = [serie(1, 10), serie(2, 10)];
    assert.deepEqual(eserciziDaSessione([b, a]).map(e => e.esercizioId), [1, 2]);
  });

  it('salta le serie non completate e gli esercizi saltati del tutto', () => {
    const esercizi = eserciziDaSessione([
      serie(1, 10), serie(1, 4, { completato: false }), serie(2, 10, { completato: false })
    ]);
    assert.deepEqual(esercizi.map(e => [e.esercizioId, e.serieTarget, e.repTarget]), [[1, 1, '10']]);
  });

  it('recupero, note e riscaldamento dalla scheda seguita; per gli esercizi aggiunti il recupero standard', () => {
    const scheda = [{ esercizioId: 1, recuperoSecondi: 150, note: 'Scapole addotte', riscaldamento: false }];
    const [panca, aggiunto] = eserciziDaSessione([serie(1, 5), serie(9, 12)], scheda);
    assert.deepEqual([panca.recuperoSecondi, panca.note, panca.riscaldamento], [150, 'Scapole addotte', false]);
    assert.deepEqual([aggiunto.recuperoSecondi, aggiunto.note, aggiunto.riscaldamento], [90, null, false]);
  });

  it("senza ripetizioni (cardio) prende durata e parametri dell'ultima serie", () => {
    const [tapis] = eserciziDaSessione([
      serie(5, 0, { durataMinuti: 8, velocitaKmh: 9, inclinazione: 2 }),
      serie(5, 0, { durataMinuti: 10, velocitaKmh: 10, inclinazione: 1, distanzaKm: 1.7 })
    ], [{ esercizioId: 5, recuperoSecondi: 0, note: null, riscaldamento: true }]);
    assert.equal(tapis.repTarget, null);
    assert.deepEqual(
      [tapis.durataMinuti, tapis.velocitaKmh, tapis.inclinazione, tapis.distanzaKm, tapis.riscaldamento],
      [10, 10, 1, 1.7, true]
    );
  });

  it('le serie a zero ripetizioni non allargano la forbice', () => {
    const [esercizio] = eserciziDaSessione([serie(1, 10), serie(1, 0), serie(1, 8)]);
    assert.deepEqual([esercizio.serieTarget, esercizio.repTarget, esercizio.durataMinuti], [3, '8-10', null]);
  });
});
