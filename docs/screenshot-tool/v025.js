// Capturas de 0.25 (tus datos a salvo): Ajustes → Almacenamiento con las copias y las canciones recuperadas solas.
// Un estudio arrancado con TIDAL_STUDIO_USERDATA apuntando a una carpeta con alguna copia y canciones en songs/.
//   OUT=../screenshots LANGS=en,es node v025.js
const { chromium, open, shot, sunday, T } = require('./lib');

// La ruta real es una carpeta temporal: en la captura se ve donde vive en un Mac
const MAC = '~/Library/Application Support/Tidal Studio/data';
const macPath = (page) => page.evaluate((mac) => document.querySelectorAll('.st-safe code').forEach((c) => { c.textContent = mac; }), MAC);

const scenes = {
  async 'data-safe'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.evaluate(() => document.querySelector('#btn-storage').click());
    await page.waitForSelector('.st-safe'); await page.waitForTimeout(500);
    await macPath(page);
    await page.locator('.st-safe').evaluate((el) => { el.style.outline = '3px solid #e0a43a'; el.style.outlineOffset = '3px'; });
    await shot(page, T(lang, 'datos-a-salvo', 'data-safe'), lang);
  },
  async 'songs-recovered'(b, lang) {
    // Un navegador que perdió «Mis proyectos»: sin nada guardado, el estudio las trae de songs/
    const { page } = await open(b, { lang, wait: 2500 });
    await page.evaluate(() => document.querySelector('#btn-projects').click()); await page.waitForTimeout(700);
    await shot(page, T(lang, 'canciones-recuperadas', 'songs-recovered'), lang);
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
