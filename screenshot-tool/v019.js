// Capturas de 0.19 (memoria sincronizada con GitHub): un ordenador nuevo que lo recupera todo, la comparación con
// GitHub y la memoria de otra persona.
//   1. python3 fake-github-sync.py 8798   (GitHub de mentira, con el repositorio de «ana/musica»)
//   2. Dos copias del estudio (A = tu ordenador, B = el nuevo), cada una con su config.json apuntando a
//      github.api_url=http://127.0.0.1:8798 y repo victor/canciones, y su carpeta de datos VACÍA.
//   3. Arranca A, siémbralo con v018.js (BASE=A node v018.js none) y espera a que sincronice (~25 s).
//   4. Arranca B (al arrancar lo trae todo de GitHub) y: BASE=http://127.0.0.1:8777 LANGS=en node v019.js
const { chromium, open, shot, sunday, T } = require('./lib');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';

async function api(path, body) {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body) } : {});
  return r.json();
}

const scenes = {
  async restored(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForSelector('#memory .mem-row', { timeout: 8000 }); await page.waitForTimeout(500);
    console.log('synced tags:', await page.locator('#memory .mem-sync.ok').count());
    await shot(page, T(lang, 'memoria-recuperada', 'memory-restored'), lang);
  },
  async compare(b, lang) {
    // Cambios que aún no han subido (la sincronización sale ~20 s después): una memoria nueva y un estilo borrado
    await api('/api/memory/add', { text: T(lang, 'En el portátil, las maquetas a 90 BPM', 'On the laptop, sketches at 90 BPM'), scope: 'global' });
    const st = (await api('/api/styles')).styles.find((s) => /salsa/i.test(s.name));
    if (st) await api('/api/styles/delete', { id: st.id });
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForTimeout(500);
    await page.click('#memory [data-tab="settings"]'); await page.waitForTimeout(500);
    await page.click('#memory [data-a="compare"]'); await page.waitForSelector('#memory .mem-cmp', { timeout: 8000 }); await page.waitForTimeout(300);
    await page.locator('#memory .mem-cmp').scrollIntoViewIfNeeded();
    console.log('diff rows:', await page.locator('#memory .mem-cmp-row').count());
    await shot(page, T(lang, 'sincronizar-comparar', 'sync-compare'), lang);
  },
  async shared(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForTimeout(500);
    await page.click('#memory [data-tab="settings"]'); await page.waitForTimeout(500);
    await page.fill('#memory [data-f="mlink"]', 'https://github.com/ana/musica');
    await page.click('#memory [data-a="mem-import"]'); await page.waitForTimeout(1200);
    await page.click('#memory [data-tab="inbox"]'); await page.waitForTimeout(600);
    console.log('shared pending:', await page.locator('#memory .mem-row.pending').count());
    await shot(page, T(lang, 'memoria-compartida', 'memory-shared'), lang);
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
