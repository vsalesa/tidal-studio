// Capturas de 0.20 (skills a la carta): el chat enseña qué secciones de cada skill se cargaron (y la que pidió
// Maestro), y el monitor RAG cuántos caracteres de skills se mandan frente a mandarlas enteras.
//   Arranca el estudio con una carpeta de datos vacía y un LLM simulado que, cuando le piden un bajo ácido, primero
//   devuelve {"mas_skills": ["strudel:references/recipes.md#Acid bassline (303-style)"]} y luego la respuesta.
//   BASE=http://127.0.0.1:8776 LANGS=en node v020.js
const { chromium, open, shot, sunday, T } = require('./lib');

async function ask(page, text) {
  const n = await page.locator('#chat .msg').count();
  await page.fill('#chat-input', text); await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('#chat .msg').length > n + 1, n, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const scenes = {
  async skills(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { chat: [] }) });
    await ask(page, T(lang, 'Haz que el bajo sea ácido, tipo 303', 'Make the bass an acid bassline'));
    const how = page.locator('#chat details, #chat .how-decided summary').first();
    if (await how.count()) await how.click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('#chat [data-skills]').last().scrollIntoViewIfNeeded();
    console.log('chips:', await page.locator('#chat .sk-chip').count());
    await shot(page, T(lang, 'skills-a-la-carta', 'skills-a-la-carte'), lang);
    await page.click('#btn-monitor'); await page.waitForTimeout(1500);
    await page.locator('.mn-node[data-layer="skills"]').click(); await page.waitForTimeout(400);
    await shot(page, T(lang, 'monitor-skills', 'monitor-skills'), lang);
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
