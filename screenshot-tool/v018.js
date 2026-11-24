// Capturas de 0.18 (memoria y estilos): memorias por ámbito, bandeja, registro que se deshace, «Mis estilos»
// (transformación con escucha previa), casos musicales, panel de almacenamiento y «recuerda que…» en el chat.
//   Arranca el estudio con una carpeta de datos VACÍA (TIDAL_STUDIO_DATA) y el LLM simulado, y luego:
//   BASE=http://127.0.0.1:8776 OUT=../screenshots node v018.js        LANGS=es … (con otra carpeta de datos vacía)
const { chromium, open, shot, sunday, T } = require('./lib');
const BASE = process.env.BASE || 'http://127.0.0.1:8765';

async function api(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body) });
  return r.json();
}

async function seed(lang) {
  const t = (es, en) => T(lang, es, en);
  const song = sunday(lang);
  const sess = { song_id: song.projectId, style: 'house', tracks: song.tracks, bpm: song.bpm };
  const chat = (text) => api('/api/chat', { messages: [{ role: 'user', content: text }], session: sess, lang });
  await api('/api/memory/add', { text: t('El hi-hat siempre suave, nunca por encima del bombo', 'Keep the hi-hat soft, never louder than the kick'), scope: 'global' });
  await api('/api/memory/add', { text: t('Esta canción acaba con un breakdown, sin fundido', 'This song ends with a breakdown, no fade-out'), scope: 'song', scope_key: song.projectId });
  await api('/api/memory/add', { text: t('Me gusta el bajo un poco detrás del pulso', 'I like the bass a little behind the beat'), scope: 'global' });
  await chat(t('Recuerda que en house prefiero palmas con una sala corta', 'Remember that in house I prefer claps with a short room'));
  await chat(t('Recuerda que el bajo nunca va detrás del pulso', 'Remember that the bass never goes behind the beat'));
  await chat(t('Recuerda que en house quiero 150 BPM', 'Remember that in house I want 150 BPM'));
  await chat(t('No me gustan los pads con mucho chorus.', "I don't like pads with a lot of chorus."));
  for (let i = 0; i < 3; i++) await api('/api/sounds/choice', { role: 'bajo', style: 'house', chosen: 'supersaw', others: ['supersaw', 'superfm', 'superpwm', 'bass3'] });
  await api('/api/styles/save', { song, name: t('Groove de domingo', 'Sunday groove'), genre: 'house' });
  const salsa = { name: 'Salsa', bpm: 180, style: 'salsa', tracks: [
    { id: 'd1', name: t('Clave 2-3', '2-3 clave'), kind: 'percusion', code: 's "<[~ claves:1 claves:1 ~] [claves:1 ~ ~ claves:1 ~ ~ claves:1 ~]>"' },
    { id: 'd2', name: 'Congas', kind: 'percusion', code: 's "congas:0 congas:1 congas:12 congas:1" # pan 0.4' },
    { id: 'd3', name: t('Bajo', 'Bass'), kind: 'bajo', code: 'note "~ ~ ~ a2 ~ ~ e3 ~" # s "acoustic_bass_fluid" # legato 0.8' },
    { id: 'd4', name: t('Piano (montuno)', 'Piano (montuno)'), kind: 'armonia', code: 'note "[a4 c5] e5 [a4 c5] e5" # s "superpiano" # room 0.2' }] };
  await api('/api/styles/save', { song: salsa, name: t('Mi salsa del jueves', 'My Thursday salsa'), genre: 'salsa' });
  await api('/api/cases/add', { problem: t('El bajo pisa al bombo y todo suena embarrado', 'The bass steps on the kick and it all sounds muddy'),
    title: t('Bajo a contratiempo', 'Off-beat bass'), before: 'd4 $ n "c2*4" # s "supersaw" # lpf 900',
    after: 'd4 $ n "~ c2 ~ c2" # s "supersaw" # lpf 900 # legato 0.8',
    why: t('El bajo deja sitio al bombo y el groove respira', 'The bass makes room for the kick and the groove breathes'), genre: 'house' });
}

const scenes = {
  async memories(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForSelector('#memory .mem-row', { timeout: 8000 }); await page.waitForTimeout(500);
    console.log('approved rows:', await page.locator('#memory .mem-row').count());
    await shot(page, T(lang, 'memoria', 'memory'), lang);
  },
  async inbox(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForTimeout(600);
    await page.click('#memory [data-tab="inbox"]'); await page.waitForTimeout(600);
    console.log('pending:', await page.locator('#memory .mem-row.pending').count(), 'notes:', await page.locator('#memory .mem-note').count());
    await shot(page, T(lang, 'memoria-bandeja', 'memory-inbox'), lang);
  },
  async log(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForTimeout(600);
    await page.click('#memory [data-tab="log"]'); await page.waitForTimeout(700);
    console.log('log rows:', await page.locator('#memory .mem-lrow').count());
    await shot(page, T(lang, 'memoria-registro', 'memory-log'), lang);
  },
  async styles(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForTimeout(600);
    await page.click('#memory [data-tab="styles"]'); await page.waitForTimeout(700);
    console.log('styles:', await page.locator('#memory .mem-style').count());
    await shot(page, T(lang, 'mis-estilos', 'my-styles'), lang);
    await page.locator('#memory .mem-style').filter({ hasText: T(lang, 'jueves', 'Thursday') }).locator('[data-a="mode-transformation"]').click();
    await page.waitForTimeout(400);
    await page.selectOption('#memory [data-t="key"]', 'Dm');
    await page.fill('#memory [data-t="bpm"]', '170');
    await page.click('#memory [data-a="t-gen"]'); await page.waitForSelector('#memory .mem-tracks', { timeout: 8000 }); await page.waitForTimeout(400);
    console.log('transformed tracks:', await page.locator('#memory .mem-tracks > div').count());
    await shot(page, T(lang, 'estilo-transformar', 'style-transform'), lang);
  },
  async cases(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-memory'); await page.waitForTimeout(600);
    await page.click('#memory [data-tab="cases"]'); await page.waitForTimeout(600);
    await shot(page, T(lang, 'casos-musicales', 'musical-cases'), lang);
  },
  async storage(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.evaluate(() => document.querySelector('#btn-storage').click()); await page.waitForSelector('#storage .st-g', { timeout: 15000 });
    await page.locator('#storage details summary').first().click().catch(() => {});
    await page.waitForTimeout(500);
    console.log('groups:', await page.locator('#storage .st-g').count());
    await shot(page, T(lang, 'almacenamiento', 'storage'), lang);
  },
  async chat(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { chat: [] }) });
    await page.fill('#chat-input', T(lang, 'Recuerda que en esta canción las palmas van siempre con sala corta', 'Remember that in this song the claps always get a short room'));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
    console.log('msgs:', await page.locator('#chat .msg').count());
    await shot(page, T(lang, 'memoria-chat', 'memory-chat'), lang);
  },
};

(async () => {
  const langs = (process.env.LANGS || 'en').split(',');
  if (!process.env.NOSEED) for (const l of langs) await seed(l);
  const b = await chromium.launch();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
  for (const n of names) for (const l of langs) {
    try { await scenes[n](b, l); } catch (e) { console.error('FAIL', n, l, e.message.split('\n')[0]); }
  }
  await b.close();
})();
