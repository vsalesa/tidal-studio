// Capturas de 0.15 (partitura MusicXML): Maestro escribe en la partitura, diálogo Partitura,
// «código libre» al editar a mano una pista que sale de la partitura y «Otra versión» en un curso.
//   OUT=../screenshots node v015.js          (inglés)     LANGS=es OUT=../screenshots node v015.js
// Necesita el estudio con un LLM de pruebas compatible con OpenAI que conteste con «cambios.partitura»
// (melodía en t6 y bajo en d4).
const { chromium, open, shot, sunday, T } = require('./lib');

async function ask(page, text) {
  const n = await page.locator('#chat .msg').count();
  await page.fill('#chat-input', text); await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('#chat .msg').length > n + 1, n, { timeout: 20000 });
  await page.waitForTimeout(1500);
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('tidal-studio-session-v2')));

const scenes = {
  async score(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { selected: 'd4' }) });
    await ask(page, T(lang, 'escríbeme una melodía con pregunta y respuesta', 'write me a melody with call and response'));
    let s = await saved(page);
    const t6 = s.tracks.find((t) => t.id === 't6');
    console.log('t6:', t6 && t6.code, '| fromScore', t6 && t6.fromScore, '| parts', s.score && s.score.parts.map((p) => p.id + '>' + p.track).join(','));
    await page.evaluate(() => document.querySelector('.track[data-id="t6"]')?.scrollIntoView({ block: 'center' }) || window.scrollTo(0, 0));
    await shot(page, T(lang, 'partitura-maestro', 'score-maestro'), lang);
    await page.click('#btn-score'); await page.waitForTimeout(900);
    console.log('score parts in dialog:', await page.locator('#score .sc-part').count());
    await shot(page, T(lang, 'partitura', 'score'), lang);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // editar a mano la pista: aparece la barra «Llevar a la partitura / código libre»
    const ta = page.locator('.track[data-id="t6"] textarea');
    await ta.fill('note "<[c5 e5 g5 a5] [g5 e5 d5 c5]>" # s "superpiano" # room 0.3 # legato 1');
    await ta.dispatchEvent('change'); await page.waitForTimeout(800);
    console.log('score bar:', await page.locator('.track[data-id="t6"] .sc-bar').count());
    await page.evaluate(() => document.querySelector('.track[data-id="t6"]')?.scrollIntoView({ block: 'center' }) || window.scrollTo(0, 0));
    await shot(page, T(lang, 'partitura-editada', 'score-edited'), lang);
    await page.click('.track[data-id="t6"] [data-sc="push"]'); await page.waitForTimeout(800);
    s = await saved(page);
    console.log('after push bars:', JSON.stringify(s.score.parts.find((p) => p.track === 't6').bars), '| bar left:', await page.locator('.track[data-id="t6"] .sc-bar').count());
    // descargar .musicxml
    await page.click('#btn-score'); await page.waitForTimeout(600);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('[data-sca="export"]')]);
    console.log('download:', dl && dl.suggestedFilename());
  },
  async 'course-other'(b, lang) {
    const st = sunday(lang, { tracks: [], name: 'Merengue', course: { id: 'merengue', i: 2, done: [0, 1] } });
    const { page } = await open(b, { lang, state: st, wait: 1800 });
    await page.click('[data-cs="apply"]'); await page.waitForTimeout(800);
    await page.click('[data-cs="other"]');
    await page.waitForSelector('.variants .va-card', { timeout: 15000 }); await page.waitForTimeout(700);
    await page.evaluate(() => { document.querySelector('.variants')?.scrollIntoView({ block: 'end' }); window.scrollTo(0, 0); }); await page.waitForTimeout(400);
    console.log('course variants:', await page.locator('.variants .va-card').count());
    await shot(page, T(lang, 'curso-otra-version', 'course-another-version'), lang);
    await page.locator('.va-card[data-k="1"] [data-va="pick"]').click(); await page.waitForTimeout(700);
    const s = await saved(page);
    const bass = s.tracks.find((t) => t.kind === 'bajo');
    console.log('picked bass:', bass && bass.code.slice(0, 80), '| fromScore', bass && bass.fromScore);
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
