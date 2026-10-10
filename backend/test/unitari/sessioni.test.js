// Le funzioni pure dietro la correzione di un allenamento dallo storico e la
// registrazione di uno passato: lettura dei valori dal client e formato dello
// storico.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  leggiValoriSerie, leggiInizio, leggiDurata, formattaPerStorico
} from '../../src/controllers/sessioni.controller.js';
import { ErroreValidazione } from '../../src/utils/errori.js';

const MINUTO = 60 * 1000;

/** Per assert.throws: un ErroreValidazione con esattamente questo messaggio */
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

describe('formattaPerStorico', () => {
  const panca = { id: 5, nome: 'Bench Press', nomeIt: 'Panca piana', gruppoMuscoloPrimario: 'Petto' };
  const croci = { id: 9, nome: 'Croci', nomeIt: null, gruppoMuscoloPrimario: 'Petto' };
  const serie = (id, esercizio, serieNumero, pesoEffettivo, repEffettive) => ({
    id, esercizioId: esercizio.id, esercizio, serieNumero, pesoEffettivo, repEffettive,
    rpe: null, durataMinuti: null, livelloResistenza: null, distanzaKm: null, velocitaKmh: null,
    // Campi del log che lo storico non mostra
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
    // Come le ordina la query dello storico: per esercizio, poi per numero
    logSerie: [serie(10, panca, 1, 80, 8), serie(11, panca, 2, 80, 7), serie(12, croci, 1, 20, 12)]
  };

  it('raggruppa le serie per esercizio, con i soli campi che lo storico mostra', () => {
    const { esercizi } = formattaPerStorico(sessione);
    assert.equal(esercizi.length, 2);
    assert.deepEqual(esercizi[0].esercizio, panca);
    assert.deepEqual(esercizi[0].serie.map(s => s.id), [10, 11]);
    assert.deepEqual(esercizi[1].serie[0], {
      id: 12, serieNumero: 1, pesoEffettivo: 20, repEffettive: 12,
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
