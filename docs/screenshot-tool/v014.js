// Capturas de 0.14 (Maestro v2): candados, A/B a ciegas, Escucha (línea base y dataset) y monitor RAG.
//   OUT=../screenshots node v014.js          (inglés)     LANGS=es OUT=../screenshots node v014.js
// Necesita el estudio con un LLM de pruebas compatible con OpenAI (respuestas fijas con opciones para d1..d4):
// el monitor enseña el recorrido real de cada petición por las capas del servidor.
const { chromium, open, shot, sunday, T } = require('./lib');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';

function locked(lang) {
  const st = sunday(lang, { bpmLock: true, selected: 'd2' });
  st.tracks[0].lock = { all: true };
  st.tracks[1].lock = { ritmo: true, sonido: true }; st.tracks[1].lockOpen = true;
  return st;
}
async function seedIndex(lang) {
  const songs = [sunday(lang), Object.assign(sunday(lang), { projectId: 'p-night', name: 'Night drive', bpm: 118 })];
  for (const s of songs) {
    await fetch(BASE + '/api/songs/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song: { id: s.projectId, name: s.name, bpm: s.bpm, style: s.style, tracks: s.tracks } }) });
  }
}
async function ask(page, text) {
  const n = await page.locator('#chat .msg').count();
  await page.fill('#chat-input', text); await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('#chat .msg').length > n + 1, n, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const scenes = {
  async locks(b, lang) {
    const { page } = await open(b, { lang, state: locked(lang) });
    await shot(page, T(lang, 'candados', 'locks'), lang);
  },
  async blind(b, lang) {
    const { page } = await open(b, { lang, state: locked(lang) });
    await ask(page, T(lang, 'dame opciones para el bajo', 'give me options for the bass'));
    await shot(page, T(lang, 'opciones-bloqueadas', 'options-locked'), lang);
    await page.click('[data-va="blind"]'); await page.waitForTimeout(400);
    await page.locator('[data-va="play"]').first().click(); await page.waitForTimeout(300);
    await page.fill('.va-why input', T(lang, 'tiene más groove', 'more groove'));
    await shot(page, T(lang, 'ab-ciegas', 'blind-ab'), lang);
    await page.locator('[data-va="vote"]').first().click(); await page.waitForTimeout(700);
    await shot(page, T(lang, 'ab-ciegas-resultado', 'blind-ab-result'), lang);
  },
  async monitor(b, lang) {
    await seedIndex(lang);
    const { page } = await open(b, { lang, state: locked(lang) });
    await ask(page, T(lang, '¿qué canciones mías usan supersaw?', 'which of my songs use supersaw?'));
    await ask(page, T(lang, 'dame opciones para el bajo', 'give me options for the bass'));
    await page.click('#btn-monitor'); await page.waitForTimeout(1500);
    await page.locator('.mn-node[data-layer="llm"]').click(); await page.waitForTimeout(400);
    await shot(page, T(lang, 'monitor-rag', 'rag-monitor'), lang);
    await page.locator('.mn-req').nth(1).click(); await page.waitForTimeout(300);
    await page.locator('.mn-node[data-layer="rules"]').click(); await page.waitForTimeout(300);
    await page.click('.mn-limits-box summary'); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.mn-limits-box').scrollIntoView({ block: 'end' }));
    await shot(page, T(lang, 'monitor-limites', 'rag-limits'), lang);
  },
  async listen(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-listen'); await page.waitForTimeout(800);
    await page.fill('input[name=missing]', T(lang, 'las palmas suenan rígidas', 'the claps feel stiff'));
    await page.click('#ls-rate button[type=submit]'); await page.waitForTimeout(900);
    await shot(page, T(lang, 'escucha', 'listen'), lang);
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
