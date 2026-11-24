// GitHub: remote path for songs opened from GitHub, the importer in Settings, and "create new songs on GitHub".
// Needs a studio whose config.json points github.api_url to fake-github.py, a song «night-drive» already saved there,
// and .tidal files in $SONGS. OUT=../screenshots node ghimport.js (L=es for Spanish)
const { chromium, open, shot, sunday, T } = require('./lib.js');
(async () => {
  const b = await chromium.launch();
  const lang = process.env.L || 'en';
  const SONGS = process.env.SONGS || '/tmp/claude-0/home/Music';
  // A local copy of «Night drive» that was opened from disk (same project as the one on GitHub)
  const night = { ...sunday(lang), projectId: 'p-night', name: 'Night drive', bpm: 100, tracks: sunday(lang).tracks.slice(0, 2),
    file: { path: SONGS + '/night-drive.tidal', name: 'night-drive.tidal', hash: '' } };
  const s1 = sunday(lang);
  const projects = [{ id: 'p-sunday', name: s1.name, updated: Date.now(), data: s1 }, { id: 'p-night', name: 'Night drive', updated: Date.now() - 1000, data: night }];
  const { page } = await open(b, { lang, state: s1, local: { 'tidal-studio-projects-v1': projects, 'tidal-studio-tabs-v1': { ids: ['p-sunday', 'p-night'], active: 0 } } });
  const tabsTxt = () => page.$$eval('.doc-tab', (xs) => xs.map((x) => (x.classList.contains('active') ? '*' : '') + x.textContent.trim() + ' — ' + x.title));
  const chip = () => page.$eval('#file-chip', (x) => (x.hidden ? '(hidden)' : x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('start', await tabsTxt());
  // 1. Open «night-drive» from GitHub: a new tab that shows victor/canciones/songs/night-drive, not the local path
  await page.click('#btn-file'); await page.waitForTimeout(200);
  await page.click('[data-f="github"]'); await page.waitForTimeout(800);
  await page.click('#gh-list [data-slug="night-drive"] [data-a="gh-open"]'); await page.waitForTimeout(900);
  console.log('opened from GitHub', await tabsTxt(), '| chip:', await chip());
  if (process.env.OUT) await shot(page, lang === 'es' ? 'github-ruta-remota' : 'github-remote-path', lang);
  // 2. Settings → GitHub
  await page.click('#btn-settings'); await page.waitForTimeout(400);
  await page.$eval('#gh-section', (d) => { d.open = true; d.scrollIntoView(); });
  await page.waitForTimeout(300);
  if (process.env.OUT) await shot(page, lang === 'es' ? 'github-ajustes' : 'github-settings', lang);
  // 3. Importer
  await page.click('#btn-gh-import'); await page.waitForTimeout(400);
  await page.fill('#gi-dir', SONGS); await page.click('#ghimport [data-a="scan"]'); await page.waitForTimeout(800);
  await page.click('#gi-delete');
  console.log('files', await page.$$eval('.gi-file', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim())));
  if (process.env.OUT) await shot(page, lang === 'es' ? 'github-importar' : 'github-import', lang);
  await page.click('#ghimport [data-a="upload"]'); await page.waitForTimeout(4000);
  console.log('result', await page.$eval('#gi-msg', (x) => x.textContent), await page.$$eval('.gi-state', (xs) => xs.map((x) => x.className + ': ' + x.textContent)));
  if (process.env.OUT) await shot(page, lang === 'es' ? 'github-importar-hecho' : 'github-import-done', lang);
  await page.click('#ghimport [data-a="close"]'); await page.waitForTimeout(200);
  // 4. New songs born on GitHub
  await page.check('#gh-create-new'); await page.waitForTimeout(600);
  await page.click('#settings [data-close]').catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(300);
  console.log('tabs after import', await tabsTxt());
  await page.click('.dt-new'); await page.waitForTimeout(400);
  const blank = await page.$('[data-m="blank"], [data-a="blank"]');
  if (blank) await blank.click(); else console.log('no blank button');
  await page.waitForTimeout(500);
  console.log('new tab chip', await chip());
  await page.$$eval('.comp-add', (xs) => xs[0].click()); await page.waitForTimeout(4000);
  console.log('after first track', await chip(), await tabsTxt());
  if (process.env.OUT) await shot(page, lang === 'es' ? 'github-crear-nuevas' : 'github-create-new', lang);
  await b.close();
})();
