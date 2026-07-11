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
};

const delay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

const GIORNI_MAPPA = {
  'sunday': 6, 'domenica': 6,
  'monday': 0, 'lunedì': 0, 'lunedi': 0,
  'tuesday': 1, 'martedì': 1, 'martedi': 1,
  'wednesday': 2, 'mercoledì': 2, 'mercoledi': 2,
  'thursday': 3, 'giovedì': 3, 'giovedi': 3,
  'friday': 4, 'venerdì': 4, 'venerdi': 4,
  'saturday': 5, 'sabato': 5,
};

/**
 * Accetta cookie consent Google
 */
async function accettaCookieGoogle(page) {
  try {
    if (page.url().includes('consent.google.com')) {
      const selettori = [
        'button:has-text("Accetta tutto")',
        'button:has-text("Accept all")',
        'button:has-text("Acceptér alle")',
        'button:has-text("Accepter tout")',
        'form button[type="submit"]',
      ];
      for (const sel of selettori) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            await btn.click();
            await delay(2000, 3000);
            return true;
          }
        } catch {}
      }
      // Fallback
      try {
        const buttons = page.locator('button[type="submit"], input[type="submit"]');
        if (await buttons.count() > 0) { await buttons.last().click(); await delay(2000, 3000); return true; }
      } catch {}
    }
    // Cookie overlay su Maps
    try {
      const cookieBtn = page.locator('button:has-text("Accetta tutto"), button:has-text("Accept all"), button:has-text("Acceptér alle")');
      if (await cookieBtn.isVisible({ timeout: 1500 })) {
        await cookieBtn.first().click();
        await delay(1000, 2000);
        return true;
      }
    } catch {}
    return false;
  } catch { return false; }
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

    // Gestisci consent redirect
    if (page.url().includes('consent.google.com')) {
      await accettaCookieGoogle(page);
      await page.waitForURL('**/maps/**', { timeout: 15000 }).catch(() => {});
      await delay(3000, 5000);
    }
    await accettaCookieGoogle(page);
    await delay(2000, 3000);

    // Se ci sono risultati multipli, clicca il primo
    try {
      const primoRisultato = page.locator('a[href*="/maps/place/"]').first();
      if (await primoRisultato.isVisible({ timeout: 3000 })) {
        await primoRisultato.click();
        await delay(3000, 5000);
      }
    } catch {}

    // === POPULAR TIMES ===
    // Aspetta che sezione Popular Times carichi
    await delay(2000, 3000);

    const popularTimesData = await page.evaluate(() => {
      const risultati = [];

      // Metodo 1: aria-label delle barre istogramma
      const barre = document.querySelectorAll('[aria-label*="busy"], [aria-label*="pieno"], [aria-label*="affollat"], [aria-label*="besøgende"], [aria-label*="travlt"]');
      barre.forEach(barra => {
        const label = barra.getAttribute('aria-label') || '';
        // EN: "Usually 45% busy at 14:00 on Monday"  
        // IT: "Di solito è il 45% pieno alle 14 il lunedì"
        // DA: "Normalt 45% travlt kl. 14 om mandagen"
        const match = label.match(/(\d+)%.*?(\d{1,2})[:.]?(?:00)?.*?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|lunedi|martedi|mercoledi|giovedi|venerdi|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/i);
        if (match) {
          risultati.push({
            percentuale: parseInt(match[1]),
            ora: parseInt(match[2]),
            giorno: match[3].toLowerCase()
          });
        }
      });

      // Metodo 2: Cerca nel testo della pagina pattern Popular Times
      if (risultati.length === 0) {
        // Prova a trovare il container Popular Times
        const allDivs = document.querySelectorAll('div[aria-label]');
        allDivs.forEach(div => {
          const label = div.getAttribute('aria-label') || '';
          if (label.match(/\d+%/) && label.match(/\d{1,2}[:.]?\d{0,2}/)) {
            const match = label.match(/(\d+)%.*?(\d{1,2})/);
            if (match && parseInt(match[1]) > 0 && parseInt(match[1]) <= 100) {
              // Senza giorno, usiamo giorno corrente
              const oggi = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
              risultati.push({
                percentuale: parseInt(match[1]),
                ora: parseInt(match[2]),
                giorno: oggi
              });
            }
          }
        });
      }

      return risultati;
    });

    // Converti + aggiungi danese
    const GIORNI_EXTRA = {
      'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3,
      'fredag': 4, 'lørdag': 5, 'søndag': 6,
      ...Object.fromEntries(Object.entries({
        'sunday': 6, 'monday': 0, 'tuesday': 1, 'wednesday': 2,
        'thursday': 3, 'friday': 4, 'saturday': 5,
        'domenica': 6, 'lunedì': 0, 'lunedi': 0, 'martedì': 1, 'martedi': 1,
        'mercoledì': 2, 'mercoledi': 2, 'giovedì': 3, 'giovedi': 3,
        'venerdì': 4, 'venerdi': 4, 'sabato': 5,
      }))
    };

    for (const dato of popularTimesData) {
      const giornoIdx = GIORNI_EXTRA[dato.giorno];
      if (giornoIdx !== undefined && dato.ora >= 0 && dato.ora <= 23) {
        risultato.storici.push({
          giornoSettimana: giornoIdx,
          ora: dato.ora,
          livelloPercentuale: Math.min(100, Math.max(0, dato.percentuale))
        });
      }
    }

    // === LIVE BUSYNESS ===
    const liveDato = await page.evaluate(() => {
      const allText = document.body.innerText;

      // Cerca percentuale live
      let match = allText.match(/(?:currently|now|live|in tempo reale|lige nu|i øjeblikket)[^\n]*?(\d+)%/i);
      if (match) return { livello: parseInt(match[1]), descrizione: match[0].trim().substring(0, 80) };

      // Pattern descrittivi → descrizione italiana fissa
      const descrizioni = [
        { pattern: /(?:much |molto )?(?:more |più )(?:busy|affollat|travl)/i, livello: 80, testo: 'Molto più affollata del solito' },
        { pattern: /(?:a little |un po[' ])?(?:more |più )(?:busy|affollat|travl)/i, livello: 65, testo: 'Più affollata del solito' },
        { pattern: /(?:as busy as usual|nella norma|come al solito|som normalt)/i, livello: 50, testo: 'Nella norma' },
        { pattern: /(?:a little |un po[' ])?(?:less|meno) (?:busy|affollat|travl)/i, livello: 35, testo: 'Meno affollata del solito' },
        { pattern: /(?:much |molto )?(?:less|meno) (?:busy|affollat|travl)/i, livello: 20, testo: 'Molto meno affollata del solito' },
        { pattern: /(?:not (?:too )?busy|poco affollat|non (?:molto )?affollat|ikke travl)/i, livello: 15, testo: 'Poco affollata' },
      ];
      for (const desc of descrizioni) {
        if (desc.pattern.test(allText)) {
          return { livello: desc.livello, descrizione: desc.testo };
        }
      }
      return null;
    });

    risultato.live = liveDato;

    // Debug: log se pagina è arrivata a Maps
    const finalUrl = page.url();
    if (!finalUrl.includes('google.com/maps')) {
      console.log(`  ⚠️  URL finale non è Maps: ${finalUrl.substring(0, 80)}`);
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
  const context = await browser.newContext({
    locale: 'it-IT',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Pre-accetta cookie
  console.log('🍪 Accettazione cookie Google...');
  await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000, 3000);
  await accettaCookieGoogle(page);
  await delay(2000, 3000);
  if (page.url().includes('consent.google.com')) {
    await accettaCookieGoogle(page);
    await page.waitForURL('**/maps/**', { timeout: 15000 }).catch(() => {});
    await delay(2000, 3000);
  }
  console.log(`  ✅ Cookie OK\n`);

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
          update: { livelloPercentuale: storico.livelloPercentuale, aggiornatoIl: new Date() },
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

main()
  .catch(err => console.error('Errore fatale:', err))
  .finally(() => prisma.$disconnect());
