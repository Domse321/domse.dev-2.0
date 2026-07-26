#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const base = (process.env.SPORT_BASE_URL || 'http://127.0.0.1:18778').replace(/\/$/, '');
const autoServe = !process.env.SPORT_BASE_URL;
const publicTarget = process.env.SPORT_PUBLIC_TARGET === '1';
const artifacts = process.env.SPORT_ARTIFACTS || '/tmp/domse-sport-gate';
fs.mkdirSync(artifacts, { recursive: true });

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${url}/sport/`);
      if (response.ok) return;
    } catch (_error) { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Lokaler Testserver wurde nicht bereit: ${url}`);
}

async function observe(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText || 'fehlgeschlagen'}`));
  return { consoleErrors, pageErrors, failedRequests };
}

(async () => {
  const server = autoServe
    ? spawn('python3', ['-m', 'http.server', '18778', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' })
    : null;
  if (server) await waitForServer(base);
  if (publicTarget) {
    const response = await fetch(`${base}/sport/`);
    const csp = response.headers.get('content-security-policy') || '';
    const frameOptions = response.headers.get('x-frame-options') || '';
    check(response.ok, `öffentliche Sportseite antwortet mit HTTP ${response.status}`);
    check(csp.includes("frame-ancestors 'none'") || frameOptions.toUpperCase() === 'DENY', 'produktiver Framing-Schutz fehlt');
    check((response.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', 'produktiver nosniff-Header fehlt');
  }
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const matrix = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'tablet-768', width: 768, height: 1024, reducedMotion: 'reduce' },
    { name: 'mobile-320', width: 320, height: 568 },
    { name: 'mobile-360', width: 360, height: 800 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-430', width: 430, height: 932 },
    { name: 'landscape-844', width: 844, height: 390 },
    { name: 'text-200', width: 390, height: 844, text: 200 },
    { name: 'forced-colors', width: 390, height: 844, forcedColors: 'active' }
  ];

  try {
    for (const config of matrix) {
      const context = await browser.newContext({
        viewport: { width: config.width, height: config.height },
        reducedMotion: config.reducedMotion || 'no-preference',
        forcedColors: config.forcedColors || 'none'
      });
      const page = await context.newPage();
      const observed = await observe(page);
      await page.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
      if (config.text) {
        await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}%`; }, config.text);
        await page.waitForTimeout(100);
      }

      const geometry = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('a, button, label')]
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 && !element.classList.contains('skip-link');
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { label: element.textContent.trim().slice(0, 55), width: rect.width, height: rect.height };
          });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          controls,
          images: [...document.images].map((image) => ({ complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })),
          attributionVisible: Boolean(document.querySelector('.hero-photo figcaption a')?.getClientRects().length),
          cards: document.querySelectorAll('.exercise-card').length
        };
      });

      check(geometry.scrollWidth <= geometry.clientWidth + 1, `${config.name}: horizontaler Overflow ${geometry.scrollWidth}/${geometry.clientWidth}`);
      check(geometry.bodyScrollWidth <= geometry.clientWidth + 1, `${config.name}: Body-Overflow ${geometry.bodyScrollWidth}/${geometry.clientWidth}`);
      check(geometry.cards === 10, `${config.name}: ${geometry.cards} statt 10 Übungen`);
      check(geometry.images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), `${config.name}: Bildpixel nicht geladen`);
      check(geometry.attributionVisible, `${config.name}: Attribution nicht sichtbar`);
      for (const control of geometry.controls) {
        check(control.height >= 43.5, `${config.name}: Touch-Ziel zu niedrig „${control.label}“ (${control.height}px)`);
      }
      check(observed.consoleErrors.length === 0, `${config.name}: Konsolenfehler: ${observed.consoleErrors.join(' | ')}`);
      check(observed.pageErrors.length === 0, `${config.name}: Seitenfehler: ${observed.pageErrors.join(' | ')}`);
      check(observed.failedRequests.length === 0, `${config.name}: Netzwerkfehler: ${observed.failedRequests.join(' | ')}`);

      const start = page.locator('[data-timer="start"]');
      await start.focus();
      const focus = await start.evaluate((element) => ({ active: document.activeElement === element, outline: getComputedStyle(element).outlineStyle }));
      check(focus.active && focus.outline !== 'none', `${config.name}: Tastaturfokus nicht sichtbar`);
      await start.evaluate((element) => element.blur());

      if (config.name === 'desktop-1440' || config.name === 'mobile-390') {
        await page.screenshot({ path: path.join(artifacts, `${config.name}.png`), fullPage: true });
      }
      results.push({ viewport: config.name, overflow: false, images: geometry.images.length, touchTargets: geometry.controls.length });
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const observed = await observe(page);
    await page.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    check(await page.locator('.skip-link').evaluate((element) => document.activeElement === element), 'Skip-Link erhält nicht den ersten Tastaturfokus');
    await page.keyboard.press('Enter');
    check(new URL(page.url()).hash === '#inhalt', 'Skip-Link springt nicht zum Hauptinhalt');
    await page.keyboard.press('Tab');
    check(await page.locator('a[href="#session"]').evaluate((element) => document.activeElement === element), 'Fokusreihenfolge nach Skip-Link ist falsch');
    check(await page.evaluate(() => Boolean(window.__DOMSE_SPORT_TEST__)), 'lokaler Test-Hook fehlt');
    check(await page.evaluate(() => window.__DOMSE_SPORT_TEST__.formatElapsed(5700000)) === '01:35:00', 'Timer-Format 95 Minuten ist falsch');
    await page.locator('[data-timer="start"]').click();
    await page.waitForTimeout(1150);
    const running = await page.locator('#timer').textContent();
    check(running !== '00:00', `Timer lief nicht an (${running})`);
    await page.locator('[data-timer="pause"]').click();
    const paused = await page.locator('#timer').textContent();
    await page.waitForTimeout(1100);
    check(await page.locator('#timer').textContent() === paused, 'Timer lief nach Pause weiter');
    await page.locator('[data-timer="reset"]').click();
    check(await page.locator('#timer').textContent() === '00:00', 'Timer-Reset fehlgeschlagen');

    await page.locator('[data-done="goblet"]').check();
    await page.locator('[data-done="rdl"]').check();
    await page.locator('#warmupCheck').check();
    check(await page.locator('#doneCount').textContent() === '2/10', 'Fortschritt wurde nicht aktualisiert');
    await page.reload({ waitUntil: 'networkidle' });
    check(await page.locator('[data-done="goblet"]').isChecked(), 'Übung blieb nach Reload nicht gespeichert');
    check(await page.locator('[data-done="rdl"]').isChecked(), 'zweite Übung blieb nach Reload nicht gespeichert');
    check(await page.locator('#warmupCheck').isChecked(), 'Warm-up blieb nach Reload nicht gespeichert');

    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.locator('#resetSession').click();
    check(await page.locator('#doneCount').textContent() === '2/10', 'abgebrochener Reset änderte den Stand');
    page.once('dialog', async (dialog) => dialog.accept());
    await page.locator('#resetSession').click();
    check(await page.locator('#doneCount').textContent() === '0/10', 'bestätigter Reset leerte den Stand nicht');
    check(!(await page.locator('#warmupCheck').isChecked()), 'bestätigter Reset leerte Warm-up nicht');
    check(await page.locator('#timer').textContent() === '00:00', 'Session-Reset leerte Timer nicht');
    for (const checkbox of await page.locator('[data-done]').all()) await checkbox.check();
    check((await page.locator('#sessionStatus').textContent()).includes('Training komplett'), 'Sessionabschluss wurde nicht angekündigt');
    check(await page.locator('nav a', { hasText: 'E-Bike' }).getAttribute('href') === '/ebike/', 'E-Bike-Navigation ist falsch');
    check(observed.consoleErrors.length === 0 && observed.pageErrors.length === 0 && observed.failedRequests.length === 0, 'Interaktionslauf erzeugte Fehler');
    results.push({ viewport: 'interaction', actions: ['timer-start', 'timer-pause', 'timer-reset', 'toggle', 'reload', 'reset-cancel', 'reset-confirm'] });
    await context.close();

    const legacyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await legacyContext.addInitScript(() => localStorage.setItem('domse-sport-done-v1', JSON.stringify({ goblet: true, curl: true })));
    const legacyPage = await legacyContext.newPage();
    await legacyPage.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
    check(await legacyPage.locator('[data-done="goblet"]').isChecked(), 'Legacy-Daten wurden nicht übernommen');
    check(await legacyPage.locator('[data-done="curl"]').isChecked(), 'zweiter Legacy-Eintrag wurde nicht übernommen');
    check(await legacyPage.evaluate(() => localStorage.getItem('domse-sport-done-v1')) === '{"goblet":true,"curl":true}', 'Legacy-Daten wurden verändert');
    results.push({ viewport: 'legacy', compatible: true });
    await legacyContext.close();

    const migratedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await migratedContext.addInitScript(() => {
      localStorage.setItem('domse-sport-done-v1', JSON.stringify({ goblet: true }));
      localStorage.setItem('domse-sport-legacy-migrated-v2', JSON.stringify({ version: 1, importedOn: 'earlier' }));
    });
    const migratedPage = await migratedContext.newPage();
    await migratedPage.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
    check(!(await migratedPage.locator('[data-done="goblet"]').isChecked()), 'Legacy-Daten wurden erneut importiert');
    results.push({ viewport: 'legacy-marker', importedOnce: true });
    await migratedContext.close();

    const midnightContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await midnightContext.addInitScript(() => {
      const NativeDate = Date;
      window.__fakeNow = new NativeDate(2026, 6, 26, 23, 59, 59).getTime();
      class TestDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [window.__fakeNow])); }
        static now() { return window.__fakeNow; }
      }
      window.Date = TestDate;
    });
    const midnightPage = await midnightContext.newPage();
    await midnightPage.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
    await midnightPage.evaluate(() => { window.__fakeNow = new Date(2026, 6, 27, 0, 0, 1).getTime(); });
    await midnightPage.locator('[data-done="goblet"]').check();
    check(await midnightPage.locator('[data-done="goblet"]').isChecked(), 'Aktion beim Kalendertagswechsel ging verloren');
    check(await midnightPage.evaluate(() => JSON.parse(localStorage.getItem('domse-sport-session-v2:2026-07-27')).done.goblet) === true, 'neuer Tageszustand speichert die auslösende Aktion nicht');
    results.push({ viewport: 'midnight-rollover', actionPreserved: true });
    await midnightContext.close();

    const corruptContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await corruptContext.addInitScript((key) => localStorage.setItem(key, '{kaputt'), `domse-sport-session-v2:${localDate()}`);
    const corruptPage = await corruptContext.newPage();
    const corruptObserved = await observe(corruptPage);
    await corruptPage.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
    check(await corruptPage.locator('#doneCount').textContent() === '0/10', 'korrupter Storage wurde nicht abgefangen');
    await corruptPage.locator('[data-done="goblet"]').check();
    check(corruptObserved.pageErrors.length === 0 && corruptObserved.consoleErrors.length === 0, 'korrupter Storage erzeugte Fehler');
    results.push({ viewport: 'corrupt-storage', recovered: true });
    await corruptContext.close();

    const blockedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await blockedContext.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }));
    const blockedPage = await blockedContext.newPage();
    const blockedObserved = await observe(blockedPage);
    await blockedPage.goto(`${base}/sport/`, { waitUntil: 'networkidle' });
    await blockedPage.locator('[data-done="goblet"]').check();
    await blockedPage.locator('[data-timer="start"]').click();
    await blockedPage.waitForTimeout(300);
    await blockedPage.locator('[data-timer="pause"]').click();
    check(blockedObserved.pageErrors.length === 0 && blockedObserved.consoleErrors.length === 0, 'blockierter Storage erzeugte Fehler');
    results.push({ viewport: 'blocked-storage', usable: true });
    await blockedContext.close();

    console.log(JSON.stringify({ status: 'PASS', base, artifacts, checks: results }, null, 2));
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(`SPORT_PRODUCT_GATE_FAIL: ${error.message}`);
  process.exit(1);
});
