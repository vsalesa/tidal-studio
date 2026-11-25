// Capturas de 0.24 (respuestas cortas): el ajuste «¿Cómo de largas son sus respuestas?» en Laboratorio → Aprender.
//   OUT=../screenshots LANGS=en,es node v024.js
const { chromium, open, shot, sunday, T } = require('./lib');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

const scenes = {
  async 'short-answers'(b, lang) {
    await post('/api/soundlab/settings', { detail: 'short' });
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-soundlab'); await page.waitForTimeout(900);
    await page.click('.sl-tab[data-tab="learn"]'); await page.waitForTimeout(400);
    const sel = page.locator('[data-set="detail"]');
    await sel.scrollIntoViewIfNeeded();
    await sel.evaluate((el) => { el.closest('section').style.outline = '3px solid #e0a43a'; el.closest('section').style.outlineOffset = '4px'; });
    console.log('detail:', await sel.inputValue());
    await shot(page, T(lang, 'respuestas-cortas', 'short-answers'), lang);
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
