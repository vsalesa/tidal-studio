// Capturas de 0.22 (efectos iguales en todas las vistas): la misma ficha de efecto (interruptor + editar) y el
// mismo editor claro en Pistas, Bloques y Código.
//   BASE=http://127.0.0.1:8765 OUT=../screenshots LANGS=en,es node v022.js
const { chromium, open, shot, sunday, T } = require('./lib');
const tab = (page, id) => page.click(`.tab[data-tab="${id}"]`);

const scenes = {
  async 'fx-tracks'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { selected: 'd4' }) });
    await page.locator('#tracks .track[data-id="d4"]').scrollIntoViewIfNeeded();
    await page.click('#tracks .track[data-id="d4"] [data-fx-open$="|p1"]'); await page.waitForTimeout(500);
    await shot(page, T(lang, 'efectos-pistas', 'effects-tracks'), lang);
  },
  async 'fx-blocks'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { selected: 'd5' }) });
    await tab(page, 'blocks'); await page.waitForTimeout(700);
    await page.locator('#blocks .bk-track[data-id="d5"]').scrollIntoViewIfNeeded();
    await page.click('#blocks .bk-track[data-id="d5"] [data-fx-open$="|p1"]'); await page.waitForTimeout(400);
    await page.click('#bk-pop .fx-sw'); await page.waitForTimeout(600);
    await shot(page, T(lang, 'efectos-bloques', 'effects-blocks'), lang);
  },
  async 'fx-code'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await tab(page, 'code'); await page.waitForTimeout(600);
    await page.click('#code-fx .cfx-track[data-id="d4"] [data-fx-open$="|p2"]'); await page.waitForTimeout(500);
    await shot(page, T(lang, 'efectos-codigo', 'effects-code'), lang);
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
