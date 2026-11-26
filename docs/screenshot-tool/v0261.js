// Capturas de 0.26.1: tiempo real en la línea de tiempo y diálogo Exportar.
//   OUT=../screenshots LANGS=en,es node v0261.js
const { chromium, open, shot, sunday, T, tab } = require('./lib');

const scenes = {
  async 'timeline-time'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('.tab[data-tab="timeline"]'); await page.waitForTimeout(1500);
    await shot(page, T(lang, 'linea-de-tiempo-tiempo', 'timeline-time'), lang);
  },
  async 'export-dialog'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-rec'); await page.waitForSelector('#exportdlg[open]'); await page.waitForTimeout(400);
    await shot(page, T(lang, 'exportar', 'export'), lang);
  },
};

(async () => {
  const langs = (process.env.LANGS || 'en').split(',');
  const b = await chromium.launch();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
  for (const n of names) for (const l of langs) {
    try { await scenes[n](b, l); } catch (e) { console.error('FAIL', n, l, e.message.split('\n')[0]); }
  }
  await b.close();
})();
