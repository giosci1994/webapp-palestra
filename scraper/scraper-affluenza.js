// ============================================
// GymMaster — Scraper Affluenza Google Maps
// Eseguito ogni 30 minuti via cron
// Scrapa Popular Times + Live Busyness
// ============================================

import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIG = {
  PROXY_URL: process.env.PROXY_URL || null,
  DELAY_MIN: 5000,
  DELAY_MAX: 15000,
  TIMEOUT_PAGINA: 30000,
  MAX_TENTATIVI: 2,
  // Tetto massimo per l'intero run. Deve restare sotto l'intervallo del cron
  // (30 min) cosi' due run non possono mai sovrapporsi.
  TIMEOUT_GLOBALE: Number(process.env.TIMEOUT_GLOBALE_MS) || 20 * 60 * 1000,
};

// Riferimento al browser accessibile dalla chiusura finale: se lo scraping
// fallisce a meta', il processo Chromium va chiuso comunque.
let browserGlobale = null;

const delay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));


/**
 * Supera il muro di consenso di Google.
 *
 * Due accortezze rispetto alla versione precedente:
 *  - Google rende PIU' COPIE dello stesso pulsante (varianti desktop/mobile) e
 *    solo una e' visibile. Il vecchio codice faceva `.first()`, che spesso
 *    pescava quella nascosta: il click non avveniva, la pagina restava su
 *    consent.google.com e lo scraping tornava sempre a mani vuote.
 *  - Si preferisce "Rifiuta tutto": sblocca la pagina esattamente come
 *    "Accetta tutto" ma senza installare i cookie di profilazione.
 */
async function cliccaPrimoVisibile(page, nomi) {
  for (const nome of nomi) {
    const loc = page.getByRole('button', { name: nome, exact: false });
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const bottone = loc.nth(i);
      if (await bottone.isVisible().catch(() => false)) {
        if (await bottone.click({ timeout: 5000 }).then(() => true).catch(() => false)) return true;
      }
    }
  }
  return false;
}

async function superaConsensoGoogle(page) {
  if (!page.url().includes('consent.google.com')) return false;

  // Prima il rifiuto (nessun cookie di tracciamento), poi l'accettazione solo
  // come ultima spiaggia se Google cambiasse le etichette.
  const rifiuta = ['Rifiuta tutto', 'Reject all', 'Afvis alle', 'Alle ablehnen', 'Tout refuser'];
  const accetta = ['Accetta tutto', 'Accept all', 'Acceptér alle', 'Alle akzeptieren'];

  let fatto = await cliccaPrimoVisibile(page, rifiuta);
  if (!fatto) fatto = await cliccaPrimoVisibile(page, accetta);

  if (fatto) {
    await page.waitForURL('**/maps/**', { timeout: 20000 }).catch(() => {});
    await delay(2000, 3000);
  }
  return fatto;
}

// Selettore della sezione "Orari di punta" nelle lingue che ci servono.
const SEL_ORARI_PUNTA = [
  '[aria-label^="Orari di punta"]',
  '[aria-label^="Popular times"]',
  '[aria-label^="Populære tidspunkter"]',
].join(', ');

const GIORNI_INDICE = {
  'lunedì': 0, 'lunedi': 0, 'monday': 0, 'mandag': 0,
  'martedì': 1, 'martedi': 1, 'tuesday': 1, 'tirsdag': 1,
  'mercoledì': 2, 'mercoledi': 2, 'wednesday': 2, 'onsdag': 2,
  'giovedì': 3, 'giovedi': 3, 'thursday': 3, 'torsdag': 3,
  'venerdì': 4, 'venerdi': 4, 'friday': 4, 'fredag': 4,
  'sabato': 5, 'saturday': 5, 'lørdag': 5,
  'domenica': 6, 'sunday': 6, 'søndag': 6,
};

/**
 * Apre la scheda del locale e attende la sezione "Orari di punta".
 *
 * Due casi da gestire: la ricerca a volte atterra direttamente sulla scheda,
 * a volte su una lista di risultati da cui va aperto il primo.
 *
 * NOTA: quando Google limita il traffico automatico dall'IP chiamante, la
 * scheda viene servita regolarmente ma SENZA la sezione Orari di punta. In quel
 * caso nessun accorgimento lato client la fa comparire (provati scroll del
 * pannello e ricarica): l'unica risposta sensata e' rinunciare e riprovare al
 * giro successivo, che e' quello che fa il chiamante.
 */
async function apriSchedaLocale(page) {
  for (let tentativo = 1; tentativo <= 2; tentativo++) {
    if (await page.locator(SEL_ORARI_PUNTA).count()) return true;

    // Lista risultati -> apri la prima scheda
    const primo = page.locator('a[href*="/maps/place/"]').first();
    if (await primo.count() && await primo.isVisible().catch(() => false)) {
      await primo.click().catch(() => {});
      await page.waitForURL('**/maps/place/**', { timeout: 15000 }).catch(() => {});
      await delay(2500, 3500);
    }

    if (await page.waitForSelector(SEL_ORARI_PUNTA, { timeout: 12000 })
          .then(() => true).catch(() => false)) return true;

    if (tentativo === 1) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT_PAGINA }).catch(() => {});
      await delay(3000, 4000);
    }
  }
  return false;
}

/**
 * Scrapa Popular Times e Live Busyness cercando per nome+indirizzo
 */
async function scrapaAffluenza(page, palestra) {
  const risultato = { storici: [], live: null };

  try {
    // Cerca per nome + indirizzo (funziona meglio di place_id URL)
    const query = `${palestra.nomeCatena} ${palestra.indirizzo} ${palestra.citta}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT_PAGINA });
    await delay(3000, 5000);

    await superaConsensoGoogle(page);

    if (!await apriSchedaLocale(page)) {
      console.log('  ⚠️  Sezione "Orari di punta" non trovata sulla scheda');
      return risultato;
    }
    await delay(1500, 2500);

    // === POPULAR TIMES ===
    // Le 168 barre (7 giorni × 24 ore) sono tutte nel DOM, sovrapposte: i
    // pulsanti avanti/indietro cambiano solo quale gruppo e' in evidenza, non i
    // dati. Il giorno NON e' piu' scritto nell'etichetta della barra
    // ("Pieno al 8% alle ore 04:00."), quindi va dedotto dalla posizione del
    // gruppo. L'ancora e' il gruppo che porta il marcatore "IN TEMPO REALE":
    // quello e' il giorno corrente. Da li' i gruppi proseguono in ordine.
    const estratto = await page.evaluate((sel) => {
      const cont = document.querySelector(sel);
      if (!cont) return { errore: 'contenitore assente' };

      const strip = [...cont.querySelectorAll('div')].find(
        d => d.children.length === 7 && d.querySelectorAll('[aria-label]').length >= 100
      );
      if (!strip) return { errore: 'gruppi giorno non trovati' };

      const gruppi = [...strip.children];
      const indiceLive = gruppi.findIndex(g => /IN TEMPO REALE|LIVE|LIGE NU/i.test(g.innerText || ''));

      // Etichetta "Ogni <giorno>" = giorno del gruppo attualmente selezionato
      const testoEtichetta = (cont.innerText || '').match(/(?:Ogni|Every|Hver)\s+([^\s\n]+)/i)?.[1] || null;

      const perGruppo = gruppi.map(g =>
        [...g.querySelectorAll('[aria-label]')]
          .map(b => b.getAttribute('aria-label'))
          .filter(l => l && /\d+\s*%/.test(l))
      );

      const testoCont = cont.innerText || '';
      return { perGruppo, indiceLive, testoEtichetta, testoCont };
    }, SEL_ORARI_PUNTA);

    if (estratto.errore) {
      console.log(`  ⚠️  ${estratto.errore}`);
      return risultato;
    }

    // Ancoraggio giorno → gruppo
    const ancora = estratto.indiceLive >= 0 ? estratto.indiceLive : 0;
    let giornoAncora = GIORNI_INDICE[(estratto.testoEtichetta || '').toLowerCase()];
    if (giornoAncora === undefined) {
      // Fallback: il gruppo col marcatore live e' oggi (lun=0 … dom=6)
      giornoAncora = (new Date().getDay() + 6) % 7;
    }

    for (let k = 0; k < estratto.perGruppo.length; k++) {
      const indiceGruppo = (ancora + k) % estratto.perGruppo.length;
      const giorno = (giornoAncora + k) % 7;

      for (const etichetta of estratto.perGruppo[indiceGruppo]) {
        // "Pieno al 8% alle ore 04:00." / "Usually 45% busy at 14:00"
        const m = etichetta.match(/(\d+)\s*%[^0-9]*(\d{1,2})/);
        if (!m) continue;
        const percentuale = parseInt(m[1], 10);
        const ora = parseInt(m[2], 10);
        if (percentuale < 0 || percentuale > 100 || ora < 0 || ora > 23) continue;
        risultato.storici.push({ giornoSettimana: giorno, ora, livelloPercentuale: percentuale });
      }
    }

    // === LIVE BUSYNESS ===
    const testo = estratto.testoCont || '';
    const percLive = testo.match(/(?:IN TEMPO REALE|LIVE|LIGE NU)[^\d%]*(\d+)\s*%/i);
    if (percLive) {
      risultato.live = { livello: parseInt(percLive[1], 10), descrizione: 'In tempo reale' };
    } else {
      const descrizioni = [
        { pattern: /molto più affollat|much busier/i, livello: 85, testo: 'Molto più affollata del solito' },
        { pattern: /più affollat|busier than usual/i, livello: 65, testo: 'Più affollata del solito' },
        { pattern: /come al solito|as busy as usual|nella norma/i, livello: 50, testo: 'Nella norma' },
        { pattern: /molto meno affollat|much less busy/i, livello: 20, testo: 'Molto meno affollata del solito' },
        { pattern: /meno affollat|less busy/i, livello: 35, testo: 'Meno affollata del solito' },
        { pattern: /non troppo affollat|not too busy|poco affollat/i, livello: 15, testo: 'Poco affollata' },
      ];
      for (const d of descrizioni) {
        if (d.pattern.test(testo)) { risultato.live = { livello: d.livello, descrizione: d.testo }; break; }
      }
    }

  } catch (err) {
    console.error(`  ❌ Errore scraping:`, err.message);
  }

  return risultato;
}

async function main() {
  const oraInizio = new Date();
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🏋️ GymMaster Scraper Affluenza`);
  console.log(`📅 ${oraInizio.toLocaleString('it-IT')}`);
  console.log(`${'═'.repeat(50)}\n`);

  // Solo palestre con Place ID E utenti registrati
  const palestre = await prisma.palestra.findMany({
    where: {
      googlePlaceId: { not: null },
      utenti: { some: {} }
    },
    orderBy: { id: 'asc' }
  });

  if (palestre.length === 0) {
    console.log('⚠️  Nessuna palestra attiva (con Place ID e utenti). Nulla da scrapare.');
    return;
  }

  const totaleConPlaceId = await prisma.palestra.count({ where: { googlePlaceId: { not: null } } });
  console.log(`📊 ${palestre.length}/${totaleConPlaceId} palestre da scrapare (solo quelle con utenti)\n`);

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };

  if (CONFIG.PROXY_URL) {
    launchOptions.proxy = { server: CONFIG.PROXY_URL };
    console.log(`🔀 Proxy attivo: ${CONFIG.PROXY_URL.replace(/:[^:]+@/, ':***@')}\n`);
  } else {
    console.log(`🌐 Nessun proxy (connessione diretta)\n`);
  }

  const browser = await chromium.launch(launchOptions);
  browserGlobale = browser;
  const context = await browser.newContext({
    locale: 'it-IT',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Supera una volta sola il muro di consenso: il cookie di scelta resta valido
  // per tutta la sessione del browser e vale per tutte le palestre successive.
  console.log('🍪 Consenso cookie Google (rifiuto tracciamento)...');
  await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000, 3000);
  const consensoGestito = await superaConsensoGoogle(page);
  console.log(consensoGestito ? '  ✅ Consenso gestito\n' : '  ✅ Nessun consenso richiesto\n');

  let successi = 0;
  let fallimenti = 0;
  let datiSalvati = 0;

  for (const [i, palestra] of palestre.entries()) {
    console.log(`[${i + 1}/${palestre.length}] ${palestra.nomeCatena} — ${palestra.indirizzo}, ${palestra.citta}`);

    let tentativo = 0;
    let dati = null;

    while (tentativo < CONFIG.MAX_TENTATIVI && !dati?.storici?.length && !dati?.live) {
      tentativo++;
      if (tentativo > 1) console.log(`  🔄 Tentativo ${tentativo}/${CONFIG.MAX_TENTATIVI}...`);
      dati = await scrapaAffluenza(page, palestra);
    }

    if (dati.storici.length > 0 || dati.live) {
      for (const storico of dati.storici) {
        await prisma.afluenzaPalestra.upsert({
          where: {
            palestraId_giornoSettimana_ora: {
              palestraId: palestra.id,
              giornoSettimana: storico.giornoSettimana,
              ora: storico.ora
            }
          },
          // Azzera i campi live: valgono solo per l'ora in corso e verrebbero
          // altrimenti trascinati per sempre sulle celle vecchie, facendo
          // apparire in dashboard un "in tempo reale" di settimane prima.
          // L'upsert live subito sotto li riscrive per la sola cella corrente.
          update: {
            livelloPercentuale: storico.livelloPercentuale,
            liveLivello: null,
            liveDescrizione: null,
            aggiornatoIl: new Date()
          },
          create: {
            palestraId: palestra.id,
            giornoSettimana: storico.giornoSettimana,
            ora: storico.ora,
            livelloPercentuale: storico.livelloPercentuale
          }
        });
        datiSalvati++;
      }

      if (dati.live) {
        const adesso = new Date();
        const giornoCorrente = (adesso.getDay() + 6) % 7;
        const oraCorrente = adesso.getHours();

        await prisma.afluenzaPalestra.upsert({
          where: {
            palestraId_giornoSettimana_ora: {
              palestraId: palestra.id,
              giornoSettimana: giornoCorrente,
              ora: oraCorrente
            }
          },
          update: { liveLivello: dati.live.livello, liveDescrizione: dati.live.descrizione, aggiornatoIl: new Date() },
          create: {
            palestraId: palestra.id,
            giornoSettimana: giornoCorrente,
            ora: oraCorrente,
            livelloPercentuale: dati.live.livello,
            liveLivello: dati.live.livello,
            liveDescrizione: dati.live.descrizione
          }
        });
        datiSalvati++;
      }

      console.log(`  ✅ ${dati.storici.length} storici${dati.live ? ' + live' : ''}`);
      successi++;
    } else {
      console.log(`  ⚠️  Nessun dato trovato`);
      fallimenti++;
    }

    if (i < palestre.length - 1) {
      const attesa = CONFIG.DELAY_MIN + Math.random() * (CONFIG.DELAY_MAX - CONFIG.DELAY_MIN);
      console.log(`  ⏳ ${Math.round(attesa / 1000)}s...\n`);
      await new Promise(r => setTimeout(r, attesa));
    }
  }

  await browser.close();

  const durata = Math.round((Date.now() - oraInizio.getTime()) / 1000);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 Riepilogo:`);
  console.log(`  ✅ Successi: ${successi}/${palestre.length}`);
  console.log(`  ⚠️  Fallimenti: ${fallimenti}`);
  console.log(`  💾 Dati: ${datiSalvati}`);
  console.log(`  ⏱️  Durata: ${durata}s`);
  console.log(`${'═'.repeat(50)}\n`);
}

// Rete di sicurezza: se un run resta appeso (pagina che non carica mai, Playwright
// che non risponde) il processo viene terminato comunque. Senza questo un singolo
// run bloccato impedisce per sempre tutti i run successivi.
const watchdog = setTimeout(() => {
  console.error(`\n\u23f0 Timeout globale superato (${Math.round(CONFIG.TIMEOUT_GLOBALE / 60000)} min) \u2014 chiusura forzata.`);
  browserGlobale?.close().catch(() => {});
  process.exit(1);
}, CONFIG.TIMEOUT_GLOBALE);
watchdog.unref();

main()
  .catch(err => {
    console.error('Errore fatale:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(watchdog);
    // Ordine importante: prima il browser, altrimenti i processi figli di
    // Chromium restano vivi e tengono aperto l'event loop all'infinito.
    if (browserGlobale) await browserGlobale.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(process.exitCode ?? 0);
  });
