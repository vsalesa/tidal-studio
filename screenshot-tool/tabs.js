const { chromium, open, shot, sunday, T } = require('./lib.js');
(async () => {
  const b = await chromium.launch();
  const lang = process.env.L || 'en';
  const s1 = sunday(lang);
  const lofi = { ...sunday(lang), projectId: 'p-lofi', name: 'Lofi study', bpm: 82, style: 'lofi', tracks: sunday(lang).tracks.slice(0, 3) };
  const projects = [{ id: 'p-sunday', name: s1.name, updated: Date.now(), data: s1 }, { id: 'p-lofi', name: 'Lofi study', updated: Date.now() - 1000, data: lofi }];
  const SONGS = process.env.SONGS || '/tmp/claude-0/home/Music'; // night-drive.tidal + rain-loops.tidal
  let dialogPath = SONGS + '/night-drive.tidal';
  const { page } = await open(b, { lang, state: s1, local: { 'tidal-studio-projects-v1': projects, 'tidal-studio-tabs-v1': { ids: ['p-sunday', 'p-lofi'], active: 0 } },
    routes: { '/api/file/dialog': () => ({ path: dialogPath }) } });
  const tabsTxt = () => page.$$eval('.doc-tab', (xs) => xs.map((x) => (x.classList.contains('active') ? '*' : '') + x.textContent.trim() + (x.classList.contains('dirty') ? '(dirty)' : '')));
  const name = () => page.$eval('#proj-name', (x) => x.value);
  const ntracks = () => page.$$eval('#tracks .track', (x) => x.length);
  console.log('start', await tabsTxt(), await name());
  await page.click('.doc-tab[data-i="1"]'); await page.waitForTimeout(400);
  console.log('switch', await tabsTxt(), await name(), await ntracks());
  await page.keyboard.press('Control+o'); await page.waitForTimeout(800);
  console.log('open file', await tabsTxt(), await name(), await ntracks());
  await page.click('.doc-tab[data-i="0"]'); await page.waitForTimeout(300);
  await page.keyboard.press('Control+o'); await page.waitForTimeout(800);
  console.log('reopen same', await tabsTxt());
  dialogPath = SONGS + '/rain-loops.tidal';
  await page.keyboard.press('Control+o'); await page.waitForTimeout(800);
  await page.fill('#bpm', '90'); await page.$eval('#bpm', (x) => x.dispatchEvent(new Event('change'))); await page.waitForTimeout(300);
  console.log('dirty', await tabsTxt());
  await page.click('.doc-tab[data-i="0"]'); await page.waitForTimeout(500); console.log('front', await tabsTxt());
  if (process.env.OUT) await shot(page, 'tabs', lang);
  await page.click('#btn-file'); await page.waitForTimeout(300);
  if (process.env.OUT) await shot(page, 'tabs-file-menu', lang);
  await page.mouse.click(700, 600); await page.waitForTimeout(200);
  const dirtyIdx = await page.$$eval('.doc-tab', (xs) => xs.findIndex((x) => x.classList.contains('dirty')));
  await page.hover(`.doc-tab[data-i="${dirtyIdx}"]`);
  await page.click(`.doc-tab[data-i="${dirtyIdx}"] .dt-close`); await page.waitForTimeout(500);
  console.log('ask open?', await page.$eval('#askdlg', (d) => d.open && d.querySelector('h2').textContent));
  if (process.env.OUT) await shot(page, 'tabs-close-ask', lang);
  await page.click('#askdlg button[data-k="discard"]'); await page.waitForTimeout(500);
  console.log('after close', await tabsTxt(), await name());
  await page.reload(); await page.waitForTimeout(1200);
  console.log('reload', await tabsTxt(), await name());
  for (let i = 0; i < 6; i++) {
    await page.click('.doc-tab.active .dt-close', { force: true }); await page.waitForTimeout(300);
    if (await page.$eval('#askdlg', (d) => d.open)) await page.click('#askdlg button[data-k="discard"]');
  }
  console.log('closed all', await tabsTxt(), await name());
  await b.close();
})();
