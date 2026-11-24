// Capturas de 0.16 (sonidos que aprenden): Laboratorio de sonido (analizar, recetas, aprender), selector de
// instrumentos con 4 estados y «Comparar los 3 mejores de oído», y el crítico automático en las opciones.
//   OUT=../screenshots node v016.js          (inglés)     LANGS=es OUT=../screenshots node v016.js
// Necesita el estudio con TIDAL_DIRT_SAMPLES apuntando a unos samples (para medirlos) y el LLM de pruebas que
// contesta con opciones cuando el mensaje habla de «options/opciones».
const { chromium, open, shot, sunday, T } = require('./lib');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';

const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
async function analyzeAll() {
  await post('/api/soundlab/analyze', { sources: ['mine', 'builtin', 'library'] });
  for (let i = 0; i < 60; i++) { const s = await (await fetch(BASE + '/api/soundlab')).json(); if (s.job.state !== 'running') return s; await new Promise((r) => setTimeout(r, 300)); }
}
function song(lang) {
  const st = sunday(lang, { selected: 'd4' });
  st.tracks[3].code = 'n "<c2 c2 a1 f1>" # s "bass1" # lpf 900 # legato 0.8';
  return st;
}
async function ask(page, text) {
  const n = await page.locator('#chat .msg').count();
  await page.fill('#chat-input', text); await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('#chat .msg').length > n + 1, n, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const scenes = {
  async lab(b, lang) {
    await post('/api/soundlab/settings', { critic: false });
    const st = await analyzeAll();
    console.log('analyzed:', JSON.stringify(st.stats.features), 'states', JSON.stringify(st.states));
    const { page } = await open(b, { lang, state: song(lang) });
    await page.click('#btn-soundlab'); await page.waitForTimeout(900);
    await shot(page, T(lang, 'laboratorio-analizar', 'soundlab-analyze'), lang);
    await page.click('.sl-tab[data-tab="recipes"]'); await page.waitForTimeout(300);
    await page.click('.sl-rec[data-id="lofi-keys"] [data-a="ab"]'); await page.waitForTimeout(200);
    await page.click('.sl-rec[data-id="dub-stab"] [data-a="ab"]'); await page.waitForTimeout(200);
    await page.click('[data-a="combine"]'); await page.waitForTimeout(500);
    console.log('combo code:', await page.locator('.sl-combo .sl-code').innerText());
    await shot(page, T(lang, 'laboratorio-recetas', 'soundlab-recipes'), lang);
    await page.click('[data-a="save-combo"]'); await page.waitForTimeout(600);
    console.log('my recipes:', await page.locator('.sl-rec .o-mine').count());
    await page.click('.sl-tab[data-tab="learn"]'); await page.waitForTimeout(300);
    await page.check('[data-set="critic"]'); await page.waitForTimeout(500);
    console.log('critic on:', await page.isChecked('[data-set="critic"]'));
    await shot(page, T(lang, 'laboratorio-aprender', 'soundlab-learning'), lang);
  },
  async compare(b, lang) {
    const { page } = await open(b, { lang, state: song(lang) });
    // Seleccionar «bass1» dentro de la pista d4 abre la tarjeta de cambiar sonido
    const ta = page.locator('.track[data-id="d4"] textarea');
    await ta.scrollIntoViewIfNeeded();
    const pos = await ta.evaluate((el) => { const i = el.value.indexOf('bass1'); el.focus(); el.setSelectionRange(i, i + 5); return i; });
    const box = await ta.boundingBox();
    await page.mouse.click(box.x + 40, box.y + 10, { clickCount: 1 }).catch(() => {});
    await ta.evaluate((el, i) => { el.focus(); el.setSelectionRange(i, i + 5); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 700, clientY: 520 })); }, pos);
    await page.waitForSelector('.rp-card:not([hidden]) .rp-opt', { timeout: 8000 }); await page.waitForTimeout(500);
    console.log('state badges:', await page.locator('.rp-card .lb-state').count());
    await shot(page, T(lang, 'selector-estados', 'picker-states'), lang);
    await page.click('[data-a="compare"]');
    await page.waitForSelector('.variants .va-card', { timeout: 8000 }); await page.waitForTimeout(800);
    await page.evaluate(() => { document.querySelector('.variants')?.closest('.msg')?.scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); }); await page.waitForTimeout(300);
    console.log('compare cards:', await page.locator('.variants .va-card').count());
    await shot(page, T(lang, 'comparar-sonidos', 'compare-sounds'), lang);
    await page.locator('.va-card[data-k="2"] [data-va="pick"]').click(); await page.waitForTimeout(800);
    const s = await (await fetch(BASE + '/api/soundlab')).json();
    console.log('picks learned:', s.stats.picks);
  },
  async critic(b, lang) {
    await post('/api/soundlab/settings', { critic: true });
    const { page } = await open(b, { lang, state: song(lang) });
    await ask(page, T(lang, 'dame opciones para el bajo', 'give me options for the bass'));
    await page.evaluate(() => { document.querySelector('.variants')?.scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); }); await page.waitForTimeout(300);
    console.log('critic chips:', await page.locator('.va-critic').count());
    await shot(page, T(lang, 'critico', 'critic'), lang);
    await post('/api/soundlab/settings', { critic: false });
  },
};

(async () => {
  const b = await chromium.launch();
  const langs = (process.env.LANGS || 'en').split(',');
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
  for (const n of names) for (const l of langs) {
    try { await scenes[n](b, l); } catch (e) { console.error('FAIL', n, l, e.message.split('\n')[0]); }
  }
  await b.close();
})();
