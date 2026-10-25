import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  accoda, leggiCoda, togliDallaCoda, esitoErrore, sessionePassataDa, inviaCoda, inviaOra, rispostaPer, ascoltaCoda
} from './codaSerie.js';

/** An in-memory localStorage; `pieno` makes every write fail */
function archivioFinto({ pieno = false } = {}) {
  const valori = new Map();
  return {
    getItem: k => (valori.has(k) ? valori.get(k) : null),
    setItem: (k, v) => { if (pieno) throw new Error('QuotaExceededError'); valori.set(k, String(v)); },
    removeItem: k => { valori.delete(k); }
  };
}

// The in-memory queue (storage that cannot write) is per user: every test uses its own user
let ultimoUtente = 0;
let utente;
let archivio;
beforeEach(() => {
  utente = ++ultimoUtente;
  archivio = archivioFinto();
  vi.restoreAllMocks();
});

const SESSIONE = { id: 7, schedaId: 3, dataInizio: '2026-10-11T08:00:00.000Z' };
const alle = ora => new Date(`2026-10-11T${ora}:00.000Z`);
const serie = (ora, dati = {}, sessione = SESSIONE) => accoda(utente, {
  tipo: 'serie', sessione, dati: { esercizioId: 1, serieNumero: 1, pesoEffettivo: 80, repEffettive: 8, ...dati }
}, archivio, alle(ora));
const termina = (ora, sessione = SESSIONE) =>
  accoda(utente, { tipo: 'completa', sessione, dati: { noteFinali: '' } }, archivio, alle(ora));

/** An error like the ones from config/api.js: no stato if there is no network */
const errore = stato => Object.assign(new Error('errore'), stato ? { stato } : {});

/** A fake server: records the calls and answers with `risposta(percorso, opzioni)` */
function serverFinto(risposta = () => ({ successo: true })) {
  const chiamate = [];
  const chiama = vi.fn(async (percorso, opzioni) => {
    chiamate.push({ percorso, metodo: opzioni.metodo, body: opzioni.body });
    return risposta(percorso, opzioni);
  });
  return { chiama, chiamate };
}

describe('la coda sul telefono', () => {
  it('tiene le voci in ordine, ognuna con la sua chiave e l\'ora in cui e\' stata fatta', () => {
    const prima = serie('08:10');
    const seconda = serie('08:13', { serieNumero: 2 });
    const voci = leggiCoda(utente, archivio);
    expect(voci.map(v => v.id)).toEqual([prima.id, seconda.id]);
    expect(prima.id).not.toBe(seconda.id);
    expect(voci[1]).toMatchObject({ tipo: 'serie', il: '2026-10-11T08:13:00.000Z', dati: { serieNumero: 2 } });
  });

  it('ogni utente ha la sua', () => {
    serie('08:10');
    expect(leggiCoda(utente + 1000, archivio)).toEqual([]);
  });

  it('toglie le voci indicate e dice se c\'erano', () => {
    const prima = serie('08:10');
    const seconda = serie('08:13');
    expect(togliDallaCoda(utente, [prima.id], archivio)).toBe(true);
    expect(togliDallaCoda(utente, [prima.id], archivio)).toBe(false);
    expect(leggiCoda(utente, archivio).map(v => v.id)).toEqual([seconda.id]);
  });

  it('se il telefono non lascia scrivere la tiene in memoria', () => {
    archivio = archivioFinto({ pieno: true });
    const voce = serie('08:10');
    expect(leggiCoda(utente, archivio).map(v => v.id)).toEqual([voce.id]);
  });

  it('un valore rovinato vale come coda vuota', () => {
    archivio.setItem(`gymmaster_coda_serie_${utente}`, '{rotto');
    expect(leggiCoda(utente, archivio)).toEqual([]);
  });

  it('avvisa chi ascolta quando cambia', () => {
    const avvisa = vi.fn();
    const smetti = ascoltaCoda(avvisa);
    serie('08:10');
    smetti();
    serie('08:11');
    expect(avvisa).toHaveBeenCalledTimes(1);
  });
});

describe('esitoErrore', () => {
  it('senza rete, server giu\' o occupato, sessione da rinnovare: si riprova', () => {
    for (const stato of [undefined, 401, 408, 429, 500, 502, 503]) expect(esitoErrore(errore(stato))).toBe('riprova');
  });

  it("404: l'allenamento sul server non c'e' piu'", () => {
    expect(esitoErrore(errore(404))).toBe('sparita');
  });

  it('rifiutata per sempre: si scarta', () => {
    for (const stato of [400, 403, 409]) expect(esitoErrore(errore(stato))).toBe('scarta');
  });
});

describe('sessionePassataDa', () => {
  it('la durata arriva fino a "Termina", con le serie e le note', () => {
    const voci = [serie('08:10'), serie('08:40', { serieNumero: 2 }), termina('08:52')];
    expect(sessionePassataDa(voci)).toEqual({
      schedaId: 3,
      dataInizio: SESSIONE.dataInizio,
      durataMinuti: 52,
      noteFinali: null,
      serie: [voci[0].dati, voci[1].dati]
    });
  });

  it('senza "Termina" arriva fino all\'ultima serie, almeno un minuto', () => {
    expect(sessionePassataDa([serie('08:10'), serie('08:35')]).durataMinuti).toBe(35);
    expect(sessionePassataDa([serie('08:00')]).durataMinuti).toBe(1);
  });

  it('the end picked at "Termina" counts more than the moment it was tapped', () => {
    const chiusura = accoda(utente, {
      tipo: 'completa', sessione: SESSIONE, dati: { noteFinali: '', fine: alle('08:45').toISOString() }
    }, archivio, alle('11:30'));
    expect(sessionePassataDa([serie('08:10'), serie('08:40'), chiusura]).durataMinuti).toBe(45);
  });

  it('senza serie non c\'e\' niente da salvare', () => {
    expect(sessionePassataDa([termina('09:00')])).toBeNull();
  });
});

describe('inviaCoda', () => {
  it('manda le voci in ordine con chiave e ora, e le toglie dalla coda', async () => {
    const prima = serie('08:10');
    const fine = termina('08:50');
    const { chiama, chiamate } = serverFinto();

    expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 2, rimaste: 0 });
    expect(chiamate).toEqual([
      { percorso: '/sessioni/7/serie', metodo: 'POST', body: { ...prima.dati, idClient: prima.id, registrataIl: prima.il } },
      { percorso: '/sessioni/7/completa', metodo: 'PATCH', body: { noteFinali: '', conclusaIl: fine.il } }
    ]);
    expect(leggiCoda(utente, archivio)).toEqual([]);
  });

  it('conserva la risposta del server per chi la aspetta', async () => {
    const fine = termina('08:50');
    const { chiama } = serverFinto(() => ({ recordPersonali: [{ id: 1 }] }));
    await inviaCoda(utente, { chiama, archivio });
    expect(rispostaPer(fine.id)).toEqual({ recordPersonali: [{ id: 1 }] });
  });

  it('senza rete si ferma e tiene tutto, nello stesso ordine', async () => {
    serie('08:10');
    serie('08:13', { serieNumero: 2 });
    const chiama = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 0, rimaste: 2 });
    expect(chiama).toHaveBeenCalledTimes(1);
  });

  it('una voce rifiutata per sempre si scarta e le altre partono', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serie('08:10');
    serie('08:13', { serieNumero: 2 });
    let prima = true;
    const { chiama, chiamate } = serverFinto(() => {
      if (prima) { prima = false; throw errore(400); }
      return {};
    });

    expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 1, rimaste: 0 });
    expect(chiamate).toHaveLength(2);
  });

  it("una voce aggiunta durante l'invio parte nello stesso giro", async () => {
    serie('08:10');
    const { chiama, chiamate } = serverFinto((percorso, opzioni) => {
      if (opzioni.body.serieNumero === 1) serie('08:13', { serieNumero: 2 });
      return {};
    });
    expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 2, rimaste: 0 });
    expect(chiamate.map(c => c.body.serieNumero)).toEqual([1, 2]);
  });

  describe("l'allenamento sul server non c'e' piu'", () => {
    const altra = { id: 9, schedaId: 4, dataInizio: '2026-10-11T07:00:00.000Z' };

    it('le sue voci diventano un allenamento passato; quelle degli altri partono come sempre', async () => {
      const voci = [serie('08:10'), serie('08:40', { serieNumero: 2 }), termina('08:50')];
      const dopo = serie('09:00', {}, altra);
      const { chiama, chiamate } = serverFinto((percorso) => {
        if (percorso.startsWith('/sessioni/7/')) throw errore(404);
        return { successo: true };
      });

      expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 4, rimaste: 0 });
      expect(chiamate.map(c => c.percorso)).toEqual(['/sessioni/7/serie', '/sessioni/passata', '/sessioni/9/serie']);
      expect(chiamate[1].body).toEqual(sessionePassataDa(voci));
      expect(chiamate[2].body.idClient).toBe(dopo.id);
    });

    it('senza rete per ricrearlo, le voci restano', async () => {
      serie('08:10');
      const { chiama } = serverFinto((percorso) => {
        throw percorso === '/sessioni/passata' ? new TypeError('Failed to fetch') : errore(404);
      });
      expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 0, rimaste: 1 });
    });

    it('con solo "Termina" in coda non c\'e\' niente da ricreare', async () => {
      termina('08:50');
      const { chiama, chiamate } = serverFinto(() => { throw errore(404); });
      expect(await inviaCoda(utente, { chiama, archivio })).toEqual({ inviate: 0, rimaste: 0 });
      expect(chiamate).toHaveLength(1);
    });
  });
});

describe('inviaOra', () => {
  it('due invii chiesti insieme non mandano due volte la stessa voce', async () => {
    serie('08:10');
    serie('08:13', { serieNumero: 2 });
    const { chiama, chiamate } = serverFinto(async () => {
      await new Promise(risolvi => setTimeout(risolvi, 5));
      return {};
    });

    await Promise.all([inviaOra(utente, { chiama, archivio }), inviaOra(utente, { chiama, archivio })]);
    expect(chiamate.map(c => c.body.serieNumero)).toEqual([1, 2]);
  });
});
