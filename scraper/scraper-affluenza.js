// ============================================
// GymMaster — Google Maps crowd level scraper
// Run every 30 minutes via cron
// Scrapes Popular Times + Live Busyness
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
  // Upper limit for the whole run. It must stay below the cron interval
  // (30 min) so two runs can never overlap.
  TIMEOUT_GLOBALE: Number(process.env.TIMEOUT_GLOBALE_MS) || 20 * 60 * 1000,
};

// Browser reference reachable from the final cleanup: if scraping fails
// halfway, the Chromium process must be closed anyway.
let browserGlobale = null;

const delay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));


/** Clicks the first visible button with one of these names; true if it clicked. */
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

/**
 * Gets past Google's consent wall.
 *
 * Two precautions compared to the previous version:
 *  - Google renders SEVERAL COPIES of the same button (desktop/mobile variants)
 *    and only one is visible. The old code did `.first()`, which often picked
 *    the hidden one: the click never happened, the page stayed on
 *    consent.google.com and scraping always came back empty-handed.
 *  - "Rifiuta tutto" (reject all) is preferred: it unlocks the page exactly
 *    like "Accetta tutto" (accept all) but without installing profiling cookies.
 */
async function superaConsensoGoogle(page) {
  if (!page.url().includes('consent.google.com')) return false;

  // Reject first (no tracking cookies), then accept only as a last resort
  // if Google changed the labels.
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

// Selector for the "Orari di punta" (popular times) section in the languages we need.
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
 * Opens the place's page and waits for the "Orari di punta" section.
 *
 * Two cases to handle: the search sometimes lands directly on the place page,
 * sometimes on a list of results from which the first one must be opened.
 *
 * NOTE: when Google throttles automated traffic from the calling IP, the
 * place page is served normally but WITHOUT the Orari di punta section. In
 * that case no client-side trick makes it appear (scrolling the panel and
 * reloading were tried): the only sensible answer is to give up and retry on
 * the next round, which is what the caller does.
 */
async function apriSchedaLocale(page) {
  for (let tentativo = 1; tentativo <= 2; tentativo++) {
    if (await page.locator(SEL_ORARI_PUNTA).count()) return true;

    // Results list -> open the first place page
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
 * Scrapes Popular Times and Live Busyness by searching for name+address
 */
async function scrapaAffluenza(page, palestra) {
  const risultato = { storici: [], live: null };

  try {
    // Search by name + address (works better than a place_id URL)
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
    // The 168 bars (7 days × 24 hours) are all in the DOM, stacked: the
    // forward/back buttons only change which group is highlighted, not the
    // data. The day is NO longer written in the bar's label
    // ("Pieno al 8% alle ore 04:00."), so it must be inferred from the group's
    // position. The anchor is the group carrying the "IN TEMPO REALE" (live)
    // marker: that is the current day. From there the groups follow in order.
    const estratto = await page.evaluate((sel) => {
      const cont = document.querySelector(sel);
      if (!cont) return { errore: 'contenitore assente' };

      const strip = [...cont.querySelectorAll('div')].find(
        d => d.children.length === 7 && d.querySelectorAll('[aria-label]').length >= 100
      );
      if (!strip) return { errore: 'gruppi giorno non trovati' };

      const gruppi = [...strip.children];
      const indiceLive = gruppi.findIndex(g => /IN TEMPO REALE|LIVE|LIGE NU/i.test(g.innerText || ''));

      // Label "Ogni <giorno>" (every <day>) = day of the currently selected group
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

    // Anchoring day → group
    const ancora = estratto.indiceLive >= 0 ? estratto.indiceLive : 0;
    let giornoAncora = GIORNI_INDICE[(estratto.testoEtichetta || '').toLowerCase()];
    if (giornoAncora === undefined) {
      // Fallback: the group with the live marker is today (Mon=0 … Sun=6)
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

  // Only gyms with a Place ID AND registered users
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

  // Get past the consent wall only once: the choice cookie stays valid for
  // the whole browser session and applies to all the following gyms.
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
          // Clear the live fields: they only apply to the current hour and
          // would otherwise be carried forever on the old cells, making the
          // dashboard show an "in tempo reale" (live) value from weeks before.
          // The live upsert right below rewrites them for the current cell only.
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

// Safety net: if a run hangs (a page that never loads, Playwright not
// responding) the process is terminated anyway. Without this a single stuck
// run blocks all the following runs forever.
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
    // Order matters: the browser first, otherwise Chromium's child processes
    // stay alive and keep the event loop open forever.
    if (browserGlobale) await browserGlobale.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(process.exitCode ?? 0);
  });
