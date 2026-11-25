// Capturas de 0.25.1: Ajustes → Pistas (16 y lo que cuesta en CPU) y Ajustes → Límites (todos los topes).
//   OUT=../screenshots LANGS=en,es node v0251.js
const { chromium, open, shot, sunday, T } = require('./lib');

const scenes = {
  async 'tracks-setting'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.evaluate(() => document.querySelector('#btn-settings').click());
    await page.waitForSelector('#settings[open]'); await page.waitForTimeout(400);
    await page.evaluate(() => {
      document.querySelectorAll('#settings details').forEach((d) => { d.open = false; });
      const d = document.querySelector('#tracks-section'); d.open = true;
      const i = document.querySelector('#tracks-count'); i.value = 16; i.dispatchEvent(new Event('input'));
      d.scrollIntoView({ block: 'center' });
      d.style.outline = '3px solid #e0a43a'; d.style.outlineOffset = '3px';
    });
    await page.waitForTimeout(300);
    await shot(page, T(lang, 'numero-de-pistas', 'tracks-setting'), lang);
  },
  async 'limits-setting'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.evaluate(() => document.querySelector('#btn-settings').click());
    await page.waitForSelector('#limits-settings input[data-lim]', { state: 'attached' }); await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.querySelectorAll('#settings details').forEach((d) => { d.open = false; });
      const d = document.querySelector('#limits-section'); d.open = true;
      const i = document.querySelector('input[data-lim="inv_samples"]'); i.value = 300; i.dispatchEvent(new Event('input'));
      d.querySelector('summary').scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    await shot(page, T(lang, 'limites', 'limits-setting'), lang);
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
