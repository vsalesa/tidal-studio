// Capturas de 0.21 (skills incluidas + índice persistente): el panel de Skills con el índice y la procedencia de las
// skills nuevas, el chat con las secciones que llevaron contexto del padre, y el monitor RAG con la traza de secciones.
//   Arranca el estudio con un LLM compatible con OpenAI de prueba (stream: false) que contesta con
//   {"skills": ["music-evaluate", "hook-writer"], "decisiones": [...]} y luego:
//   BASE=http://127.0.0.1:8781 OUT=../screenshots LANGS=en node v021.js
const { chromium, open, shot, sunday, T } = require('./lib');

async function ask(page, text) {
  const n = await page.locator('#chat .msg').count();
  await page.fill('#chat-input', text); await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('#chat .msg').length > n + 1, n, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const scenes = {
  async panel(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { chat: [] }) });
    await page.click('#btn-skills'); await page.waitForTimeout(1200);
    const c = page.locator('#skills-body .sk-card[data-name="music-evaluate"]');
    await page.locator('#skills-body .kn-box').scrollIntoViewIfNeeded();
    await page.evaluate(() => { const k = document.querySelector('#skills-body .kn-box'); k.closest('#skills-body').scrollTop = k.offsetTop - 120; });
    await page.waitForTimeout(300);
    console.log('cards:', await page.locator('#skills-body .sk-card').count(), 'eval:', await c.count());
    await shot(page, T(lang, 'skills-indice', 'skills-index'), lang);
    await page.locator('#skills-body .sk-card[data-name="prosody-checker"]').scrollIntoViewIfNeeded();
    await shot(page, T(lang, 'skills-incluidas', 'skills-bundled'), lang);
  },
  async chat(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { chat: [] }) });
    await ask(page, T(lang, 'Evalúa el estribillo y escribe un gancho pegadizo para la voz', 'Evaluate the chorus and write a catchy hook for the vocal'));
    await page.locator('#chat [data-skills]').last().scrollIntoViewIfNeeded();
    console.log('chips:', await page.locator('#chat .sk-chip').count(), 'ctx:', await page.locator('#chat .sk-chip .par').count());
    await shot(page, T(lang, 'skills-contexto', 'skills-context'), lang);
    await page.click('#btn-monitor'); await page.waitForTimeout(1500);
    await page.locator('.mn-node[data-layer="skills"]').click(); await page.waitForTimeout(400);
    const tr = page.locator('.mn-trace'); if (await tr.count()) await tr.scrollIntoViewIfNeeded();
    console.log('trace:', await page.locator('.mn-trace li').count());
    await shot(page, T(lang, 'monitor-indice', 'monitor-index'), lang);
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
