// Screenshots of app updates (server/appupdate.py + web/appupdate.js).
// Needs a studio started with a fake installed version and a local Release feed, e.g.:
//   TIDAL_STUDIO_RUNTIME=<dir with VERSION = 0.10.0> TIDAL_STUDIO_UPDATE_FEED=<release.json> python3 server/app.py --no-browser
// (release.json = the GitHub API answer for releases/latest, with file:// asset URLs). Run: OUT=../screenshots node app-update.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, open, shot, sunday } = require('./lib');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const LANGS = (process.env.LANGS || 'en').split(',');
const post = (p, b = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

(async () => {
  const browser = await chromium.launch();
  for (const lang of LANGS) {
    fs.rmSync(path.join(os.homedir(), '.tidal-studio', 'updates'), { recursive: true, force: true });
    await post('/api/appupdate/skip', { version: '' });
    await post('/api/appupdate/check');
    const { page } = await open(browser, { lang, state: sunday(lang), wait: 2500 });
    await page.waitForSelector('#upd-banner:not([hidden])');
    await shot(page, 'app-update', lang);
    await page.click('#upd-banner [data-u=notes]');
    await shot(page, 'app-update-notes', lang);
    await page.click('#upd-banner [data-u=download]');
    await page.waitForFunction(() => { const s = document.querySelector('.upd-pct'); return s && parseInt(s.textContent) >= 35; }, null, { timeout: 60000 });
    await shot(page, 'app-update-download', lang);
    await page.waitForSelector('#upd-banner [data-u=install]', { timeout: 120000 });
    await page.click('#upd-banner [data-u=notes]');
    await shot(page, 'app-update-ready', lang);
    await page.click('#btn-settings');
    await page.waitForTimeout(800);
    await page.evaluate(() => { document.getElementById('upd-banner').hidden = true; const s = document.getElementById('upd-section'); s.open = true; s.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(500);
    await shot(page, 'app-update-settings', lang);
    await page.close();
  }
  await browser.close();
})();
