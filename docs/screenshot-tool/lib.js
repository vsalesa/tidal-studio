const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const OUT = process.env.OUT;
const T = (lang, es, en) => (lang === 'es' ? es : en);

function sunday(lang, extra = {}) {
  return Object.assign({
    bpm: 124, name: 'Sunday house', style: 'house', step: 'libre', projectId: 'p-sunday', selected: 'd3',
    tracks: [
      { id: 'd1', name: T(lang, 'Bombo', 'Kick'), kind: 'percusion', code: 's "bd*4" # gain 1.1', muted: false, mix: { vol: 1.5, low: 4, mid: 0, high: 0 } },
      { id: 'd2', name: T(lang, 'Palmas', 'Claps'), kind: 'percusion', code: 's "~ cp ~ cp" # room 0.2', muted: false, mix: { vol: -3, low: 1, mid: 0, high: 3 } },
      { id: 'd3', name: T(lang, 'Hi-hat a contratiempo', 'Off-beat hat'), kind: 'percusion', code: 's "~ hh ~ hh" # gain 0.9', muted: false, mix: { vol: 0, low: 1, mid: 0, high: 1 } },
      { id: 'd4', name: T(lang, 'Bajo', 'Bass'), kind: 'bajo', code: 'n "<c2 c2 a1 f1>" # s "supersaw" # lpf 900 # legato 0.8', muted: false, mix: { vol: -2, low: 5, mid: -3, high: -5 } },
      { id: 'd5', name: T(lang, 'Acordes', 'Chords'), kind: 'armonia', code: 'n "<c\'min7 a\'maj7 f\'maj7 g\'dom7>" # s "superpiano" # room 0.4 # gain 0.8', muted: false, mix: { vol: -5, low: -4, mid: 2, high: 2 } },
    ],
    chat: [], options: [], ideas: [], learnedMusic: [], offline: false,
  }, extra);
}

async function open(browser, { lang = 'en', state = null, local = {}, routes = {}, path = '/', wait = 1200, viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: lang === 'es' ? 'es-ES' : 'en-US' });
  await ctx.addInitScript(([lang, state, local]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('tidal-studio-lang', lang);
    localStorage.setItem('tidal-studio-tour-done', '1');
    if (state) localStorage.setItem('tidal-studio-session-v2', JSON.stringify(state));
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, [lang, state, local]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  for (const [pat, fn] of Object.entries(routes)) {
    await page.route('**' + pat + '*', async (route) => {
      let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
      const r = await fn(body, route.request());
      if (r === undefined) return route.continue();
      if (r && r.__delay) await new Promise((ok) => setTimeout(ok, r.__delay));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r && r.__delay ? r.body : r) });
    });
  }
  await page.goto(BASE + path);
  await page.waitForTimeout(wait);
  return { ctx, page };
}

async function shot(page, name, lang) {
  await page.mouse.move(1, 1).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const fix = (s) => s.replace(/\/tmp\/claude[^\s,)"']*?\/(run2?|f?home)(?=\/|\b)/g, (m, d) => (d.startsWith('run') ? '~/tidal-studio' : '~'));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (/\/tmp\/claude/.test(n.nodeValue)) n.nodeValue = fix(n.nodeValue);
    document.querySelectorAll('input,textarea').forEach((i) => { if (/\/tmp\/claude/.test(i.placeholder)) i.placeholder = fix(i.placeholder); if (/\/tmp\/claude/.test(i.value)) i.value = fix(i.value); });
  }).catch(() => {});
  const file = `${OUT}/${lang === 'es' ? 'es/' : ''}${name}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
}

module.exports = { chromium, open, shot, sunday, T };
