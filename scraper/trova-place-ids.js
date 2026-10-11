// ============================================
// GymMaster — Find Google Place IDs
// One-off script to look up the Place ID
// of every gym in the DB
// ============================================

import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const delay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

/**
 * Accepts Google's cookie consent (redirect to consent.google.com)
 */
async function accettaCookieGoogle(page) {
  try {
    // If we are on consent.google.com, click "Accetta tutto" (accept all)
    if (page.url().includes('consent.google.com')) {
      // Look for accept buttons in several languages
      const selettori = [
        'button:has-text("Accetta tutto")',
        'button:has-text("Accept all")',
        'button:has-text("Accepter tout")',
        'button:has-text("Acceptér alle")',
        'form:has(input[name="set_eom"]) button',
        'button[aria-label*="ccept"]',
      ];
      
      for (const sel of selettori) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            await btn.click();
            await delay(2000, 3000);
            return true;
          }
        } catch { /* try the next selector */ }
      }
      
      // Fallback: click any button in the form
      try {
        const buttons = page.locator('button[type="submit"], input[type="submit"]');
        const count = await buttons.count();
        if (count > 0) {
          await buttons.last().click();
          await delay(2000, 3000);
          return true;
        }
      } catch {}
    }
    
    // A cookie banner overlay might also appear on Maps
    try {
      const cookieBtn = page.locator('button:has-text("Accetta tutto"), button:has-text("Accept all"), button:has-text("Acceptér alle")');
      if (await cookieBtn.isVisible({ timeout: 1500 })) {
        await cookieBtn.first().click();
        await delay(1000, 2000);
        return true;
      }
    } catch {}
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Searches for a gym on Google Maps and extracts the Place ID from the URL
 */
async function cercaPlaceId(page, query) {
  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(2000, 3000);

    // Handle the consent redirect
    if (page.url().includes('consent.google.com')) {
      await accettaCookieGoogle(page);
      // After consent, Google should redirect to Maps
      await page.waitForURL('**/maps/**', { timeout: 15000 }).catch(() => {});
      await delay(3000, 5000);
    }

    // Handle the cookie overlay on Maps
    await accettaCookieGoogle(page);
    await delay(2000, 4000);

    // Check the URL for a Place ID
    const currentUrl = page.url();

    // Method 1: Place ID pattern !1s in the URL
    const placeIdMatch = currentUrl.match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/);
    if (placeIdMatch) return placeIdMatch[1];

    // Method 2: ChIJ pattern
    const chijMatch = currentUrl.match(/(ChIJ[A-Za-z0-9_-]+)/);
    if (chijMatch) return chijMatch[1];

    // Method 3: search the page content
    const content = await page.content();
    const contentMatch = content.match(/"(ChIJ[A-Za-z0-9_-]+)"/);
    if (contentMatch) return contentMatch[1];

    // Method 4: if there are multiple results, click the first
    try {
      const primoRisultato = page.locator('a[href*="/maps/place/"]').first();
      if (await primoRisultato.isVisible({ timeout: 3000 })) {
        await primoRisultato.click();
        await delay(3000, 5000);

        const newUrl = page.url();
        const m1 = newUrl.match(/(ChIJ[A-Za-z0-9_-]+)/);
        if (m1) return m1[1];
        const m2 = newUrl.match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/);
        if (m2) return m2[1];
      }
    } catch {}

    // Method 5: Place ID from the data attribute
    try {
      const placeEl = await page.$('[data-place-id]');
      if (placeEl) {
        const pid = await placeEl.getAttribute('data-place-id');
        if (pid) return pid;
      }
    } catch {}

    console.log(`  ⚠️  Place ID non trovato`);
    console.log(`  URL: ${currentUrl.substring(0, 120)}`);
    return null;
  } catch (err) {
    console.error(`  ❌ Errore:`, err.message);
    return null;
  }
}

async function main() {
  console.log('🔍 Ricerca Google Place IDs per tutte le palestre...\n');

  const palestre = await prisma.palestra.findMany({
    where: { googlePlaceId: null },
    orderBy: { id: 'asc' }
  });

  if (palestre.length === 0) {
    console.log('✅ Tutte le palestre hanno già un Place ID!');
    return;
  }

  console.log(`📊 ${palestre.length} palestre da cercare\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    locale: 'it-IT',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Pre-accept cookies by visiting Google Maps once
  console.log('🍪 Accettazione cookie Google...');
  await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000, 3000);
  await accettaCookieGoogle(page);
  await delay(2000, 3000);
  // If still on consent, try again
  if (page.url().includes('consent.google.com')) {
    await accettaCookieGoogle(page);
    await page.waitForURL('**/maps/**', { timeout: 15000 }).catch(() => {});
    await delay(2000, 3000);
  }
  console.log(`  ✅ Cookie gestiti. URL: ${page.url().substring(0, 60)}...\n`);

  let trovati = 0;
  let nonTrovati = 0;

  for (const [i, p] of palestre.entries()) {
    const query = `${p.nomeCatena} ${p.indirizzo} ${p.citta}`;
    console.log(`[${i + 1}/${palestre.length}] Cerco: ${query}`);

    const placeId = await cercaPlaceId(page, query);

    if (placeId) {
      await prisma.palestra.update({
        where: { id: p.id },
        data: { googlePlaceId: placeId }
      });
      console.log(`  ✅ Place ID: ${placeId}`);
      trovati++;
    } else {
      nonTrovati++;
    }

    if (i < palestre.length - 1) {
      const attesa = 5000 + Math.random() * 10000;
      console.log(`  ⏳ Attendo ${Math.round(attesa / 1000)}s...\n`);
      await delay(attesa, attesa + 1000);
    }
  }

  await browser.close();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`📊 Riepilogo:`);
  console.log(`  ✅ Trovati: ${trovati}`);
  console.log(`  ⚠️  Non trovati: ${nonTrovati}`);
  console.log(`${'═'.repeat(40)}`);
}

main()
  .catch(err => console.error('Errore fatale:', err))
  .finally(() => prisma.$disconnect());
