const { chromium, open, shot, sunday, T } = require('./lib');
const SK = (lang) => ({ active: 3, loaded: [{ name: 'music-composition', refs: ['references/groove-and-feel.md'] }, { name: 'strudel', refs: ['references/recipes.md'] }, { name: 'livecoding' }], used: ['livecoding', 'music-composition'] });

// Maestro replies by the student's last message
function chatMock(lang, table) {
  return (body) => {
    const last = (body.messages || []).filter((m) => m.role === 'user').pop() || { content: '' };
    for (const [re, fn] of table) if (re.test(last.content)) return { __delay: 300, body: fn(body) };
    return { __delay: 300, body: { mensaje: T(lang, 'Hecho.', 'Done.'), opciones: [] } };
  };
}
const hatReply = (lang) => () => ({
  mensaje: T(lang, 'He añadido un hi-hat a contratiempo que llena los huecos entre los bombos. Los contratiempos dan al groove su swing. ¿Lo quieres más cargado o más relajado?',
    'I added an off-beat hi-hat that fills the gaps between the kicks. Off-beats give the groove its swing. Do you want it busier or more relaxed?'),
  explicacion: [{ fragmento: 's "~ hh ~ hh"', explicacion: T(lang, '«~» son silencios: el hi-hat suena entre los bombos.', 'The ~ are rests, so the hat lands between the kicks.') },
    { fragmento: '# gain 0.9', explicacion: T(lang, 'Un poco más bajo para no tapar el bombo.', 'A bit quieter so it doesn\'t cover the kick.') }],
  reto: T(lang, 'Cambia un «hh» por «hh*2» y escucha cómo se anima.', 'Change one «hh» to «hh*2» and listen to how it gets busier.'),
  opciones: [T(lang, 'Más cargado', 'Busier'), T(lang, 'Más relajado', 'More relaxed'), T(lang, 'Añade un bajo', 'Add a bass')],
  cambios: { pistas: [{ id: 'd3', nombre: T(lang, 'Hi-hat a contratiempo', 'Off-beat hat'), tipo: 'percusion', codigo: 's "~ hh ~ hh" # gain 0.9' }] },
  sugerencias: [{ titulo: T(lang, 'Yo pondría palmas en el 2 y el 4', "I'd add claps on 2 and 4"), porque: T(lang, 'El backbeat es lo que te hace mover la cabeza.', 'The backbeat is what makes you nod your head.'), concepto: 'Backbeat', cambios: { pistas: [{ id: 'd6', nombre: 'Claps', tipo: 'percusion', codigo: 's "~ cp ~ cp"' }] } },
    { titulo: T(lang, '¿Quieres que suene tipo jazz?', 'Want it to sound like jazz?'), porque: T(lang, 'El jazz se reconoce por el swing, los acordes con muchas notas y un bajo que camina.', "Jazz is recognized by swing, chords with lots of notes and a walking bass."), concepto: T(lang, 'Swing', 'Swing'), cambios: { pistas: [{ id: 'd1', nombre: 'Kick', tipo: 'percusion', codigo: 'swingBy (1/3) 4 $ s "bd ~ [~ bd] ~"' }] } }],
  skills: SK(lang),
});

async function studioWithHat(b, lang, opts = {}) {
  const st = sunday(lang); st.tracks = st.tracks.map((t) => (t.id === 'd3' ? { ...t, code: 's "[~ hh]*4" # gain 0.85' } : t));
  const { page, ctx } = await open(b, { lang, state: st, routes: { '/api/chat': chatMock(lang, [[/./, hatReply(lang)]]), ...(opts.routes || {}) }, ...opts });
  await page.fill('#chat-input', T(lang, 'Añade un hi-hat a contratiempo', 'Add an off-beat hat'));
  await page.press('#chat-input', 'Enter');
  await page.waitForTimeout(1500);
  return { page, ctx };
}
const tab = (page, t) => page.click(`.tab[data-tab="${t}"]`);

const scenes = {
  async studio(b, lang) { const { page } = await studioWithHat(b, lang); await shot(page, lang === 'es' ? 'estudio' : 'studio', lang); },
  async 'live-highlight'(b, lang) {
    const { page } = await studioWithHat(b, lang);
    await page.click('#btn-play'); await page.waitForTimeout(1800);
    await shot(page, T(lang, 'resaltado-pistas', 'live-highlight-tracks'), lang);
    await tab(page, 'blocks'); await page.waitForTimeout(1200); await shot(page, T(lang, 'resaltado-bloques', 'live-highlight-blocks'), lang);
    await tab(page, 'code'); await page.waitForTimeout(1200); await shot(page, T(lang, 'resaltado-codigo', 'live-highlight-code'), lang);
  },
  async mixer(b, lang) { const { page } = await studioWithHat(b, lang); await tab(page, 'mixer'); await page.waitForTimeout(800); await shot(page, T(lang, 'mezcla', 'mixer'), lang); },
  async blocks(b, lang) { const { page } = await open(b, { lang, state: sunday(lang) }); await tab(page, 'blocks'); await page.waitForTimeout(800); await shot(page, T(lang, 'bloques', 'blocks'), lang); },
  async 'clear-chat'(b, lang) { const { page } = await studioWithHat(b, lang); await page.click('#btn-clear-chat'); await page.waitForTimeout(800); await shot(page, T(lang, 'limpiar-chat', 'clear-chat'), lang); },
  async 'hide-ideas'(b, lang) { const { page } = await studioWithHat(b, lang); await page.click('#btn-hide-ideas'); await page.waitForTimeout(600); await shot(page, T(lang, 'ocultar-ideas', 'hide-ideas'), lang); },

  async arrangement(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await tab(page, 'arrange'); await page.waitForTimeout(500);
    await page.click('.ar-presets button[data-p]:nth-child(3)'); await page.waitForTimeout(800);
    await shot(page, T(lang, 'arreglo', 'arrangement'), lang);
  },
  async 'blocks-edit'(b, lang) {
    const st = sunday(lang); st.tracks[2].code = 'every 4 (fast 2) $ s "[~ hh]*4" # gain 0.85';
    const { page } = await open(b, { lang, state: st });
    await tab(page, 'blocks'); await page.waitForTimeout(600);
    await page.click('#blocks .bk-track[data-id="d2"] .bk-step.rest >> nth=1'); await page.waitForTimeout(700);
    await shot(page, T(lang, 'bloques-editar', 'blocks-edit'), lang);
  },
  async 'code-help'(b, lang) {
    const st = sunday(lang); st.tracks[1].code = 'every 4 (fast 2) s "~ cp ~ cp" # gain 0.8'; st.tracks[1].lastGood = 's "~ cp ~ cp" # room 0.2';
    st.tracks[1].error = 'Couldn\'t match expected type ‘Pattern ValueMap’ with actual type ‘Pattern String -> ControlPattern’';
    const { page } = await open(b, { lang, state: st, routes: { '/api/fix': () => ({
      diagnostico: T(lang, 'Falta el $ después de «every 4 (fast 2)», así que Tidal lee el patrón como un argumento más.', 'The $ is missing after «every 4 (fast 2)», so Tidal reads the pattern as an extra argument.'),
      codigo: 'every 4 (fast 2) $ s "~ cp ~ cp" # gain 0.8',
      explicacion: [{ fragmento: '$', explicacion: T(lang, 'Separa la transformación de aquello a lo que se aplica.', 'Separates the transformation from what it applies to.') }],
      reto: T(lang, 'Cambia fast 2 por fast 3 y escucha.', 'Change fast 2 for fast 3 and listen.') }) } });
    await page.click('#tracks .track[data-id="d2"] [data-a="help"]'); await page.waitForTimeout(600);
    await page.click('#tracks .track[data-id="d2"] [data-a="ask"]'); await page.waitForTimeout(1500);
    await shot(page, T(lang, 'ayuda-codigo', 'code-help'), lang);
  },
  async 'code-palette'(b, lang) {
    const st = sunday(lang); st.selected = 'd2';
    const { page } = await open(b, { lang, state: st });
    await page.click('.ltab[data-pane="palette"]'); await page.waitForTimeout(500);
    await shot(page, T(lang, 'paleta-codigo', 'code-palette'), lang);
  },
  async 'configurator-card'(b, lang) {
    const st = sunday(lang); st.selected = 'd4';
    const { page } = await open(b, { lang, state: st });
    await page.click('#tracks .track[data-id="d4"] [data-a="card"]'); await page.waitForTimeout(1200);
    await shot(page, T(lang, 'tarjeta-configuradora', 'configurator-card'), lang);
  },
  async 'chat-controls'(b, lang) {
    const st = sunday(lang); st.selected = 'd1';
    const { page } = await open(b, { lang, state: st });
    await page.click('#tracks .track[data-id="d1"] [data-a="controls"]'); await page.waitForTimeout(1200);
    await shot(page, T(lang, 'controles-chat', 'chat-controls'), lang);
  },
  async 'recipe-jazz'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#flavors button[data-f="jazz"]'); await page.waitForTimeout(1500);
    await shot(page, T(lang, 'receta-jazz', 'recipe-jazz'), lang);
  },
  async history(b, lang) {
    const { page } = await studioWithHat(b, lang);
    await page.fill('#bpm', '128'); await page.press('#bpm', 'Enter'); await page.waitForTimeout(600);
    await page.click('#btn-history'); await page.waitForTimeout(800);
    await shot(page, T(lang, 'historial', 'history'), lang);
  },

  async 'new-project'(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-new'); await page.waitForTimeout(700);
    await shot(page, T(lang, 'nuevo-proyecto', 'new-project'), lang);
  },
  // Generar desde mi MIDI: examples/little-tune.mid (python3 tools/make_example_midi.py)
  async 'midi-generate'(b, lang) {
    const MID = require('path').join(__dirname, '..', '..', 'examples', 'little-tune.mid');
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-file'); await page.waitForTimeout(300);
    await page.click('#file-pop [data-f="generate"]'); await page.waitForTimeout(500);
    await shot(page, T(lang, 'midi-generar-subir', 'midi-generate-upload'), lang);
    await page.setInputFiles('#np-body .imp-drop input', MID); await page.waitForSelector('.gen-styles'); await page.waitForTimeout(400);
    await page.click('.gen-styles [data-style="bossa"]'); await page.waitForTimeout(300);
    await shot(page, T(lang, 'midi-generar-estilo', 'midi-generate-style'), lang);
    await page.click('.wz-nav [data-a="go"]'); await page.waitForSelector('.gen-tracks'); await page.waitForTimeout(500);
    await page.evaluate(() => { const l = document.querySelector('.gen-tracks'); l.scrollTop = l.scrollHeight; });
    await shot(page, T(lang, 'midi-generar-resultado', 'midi-generate-result'), lang);
    await page.click('.wz-nav [data-a="use"]'); await page.waitForTimeout(1800);
    await shot(page, T(lang, 'midi-generar-estudio', 'midi-generate-studio'), lang);
  },
  async 'midi-generate-course'(b, lang) {
    const MID = require('path').join(__dirname, '..', '..', 'examples', 'little-tune.mid');
    const st = sunday(lang, { tracks: [], name: 'Merengue', course: { id: 'merengue', i: 1, done: [0],
      mine: { name: 'little-tune', bpm: 110, key: 'C', chords: ['C', 'Am', 'F', 'G'], instruments: ['Melody', 'Piano', 'Bass', 'Kick', 'Snare & claps', 'Hats & cymbals'], tracks: [], reference: '' } } });
    const { page } = await open(b, { lang, state: st, wait: 1800 });
    await page.evaluate(() => document.querySelector('.cs-mine-box')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    await shot(page, T(lang, 'midi-generar-curso', 'midi-generate-course'), lang);
    await page.click('[data-mine="gen"]'); await page.waitForTimeout(500);
    await page.setInputFiles('#np-body .imp-drop input', MID); await page.waitForSelector('.gen-styles'); await page.waitForTimeout(400);
    await page.click('.wz-nav [data-a="go"]'); await page.waitForSelector('.gen-tracks'); await page.waitForTimeout(500);
    await shot(page, T(lang, 'midi-generar-merengue', 'midi-generate-merengue'), lang);
  },
  async wizard(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-new'); await page.waitForTimeout(400);
    await page.click('.np-choice[data-m="wizard"]'); await page.waitForTimeout(700);
    const names = lang === 'es' ? ['wizard-1-estilo', 'wizard-2-tempo', 'wizard-3-ritmo', 'wizard-4-acordes', 'wizard-5-efectos', 'wizard-6-estructura', 'wizard-7-resumen']
      : ['wizard-1-style', 'wizard-2-tempo', 'wizard-3-beat', 'wizard-4-chords', 'wizard-5-effects', 'wizard-6-structure', 'wizard-7-summary'];
    const want = [[/style|estilo/i, 0], [/fast|r\u00e1pido|velocidad|tempo/i, 1], [/beat|ritmo/i, 2], [/chord|acorde/i, 3], [/effect|efecto/i, 4], [/organi|when|structure|estructura|cu\u00e1ndo/i, 5]];
    const done = new Set();
    for (let i = 0; i < 14; i++) {
      const h = (await page.locator('#bd-body h2').first().textContent().catch(() => '')) || '';
      if (i === 0) { await page.click('#bd-body .opt >> nth=3'); await page.waitForTimeout(500); }
      const nx = page.locator('#bd-body [data-a="next"]');
      if (!(await nx.count())) { await shot(page, names[6], lang); break; }
      for (const [re, k] of want) if (re.test(h) && !done.has(k)) { done.add(k); await shot(page, names[k], lang); break; }
      console.log('step', i, h);
      await nx.click(); await page.waitForTimeout(800);
    }
  },
  async brainstorm(b, lang) {
    const plan = { titulo: 'Neon at 3 AM', resumen: T(lang, 'House luminoso con un bajo cálido y acordes que se abren en el drop. Encaja con la energía de club que has descrito.', 'Bright house with a warm bass and chords that open up in the drop. It matches the club energy you described.'),
      estilo: 'house', bpm: 124, partes: [{ nombre: 'Intro', compases: 8, que: T(lang, 'Pads y hi-hats', 'Pads and hats only') }, { nombre: 'Build', compases: 8, que: T(lang, 'Entran bombo y bajo', 'Kick and bass come in') }, { nombre: 'Drop', compases: 16, que: T(lang, 'Suena todo', 'Everything plays') }],
      sugerencias: [{ titulo: T(lang, 'Empezaría con un bombo', "I'd start with a kick"), porque: T(lang, 'marca el pulso de todo lo demás', 'it sets the pace for everything else'), concepto: T(lang, 'Pulso', 'Pulse'), cambios: { pistas: [{ id: 'd1', nombre: 'Kick', tipo: 'percusion', codigo: 's "bd*4"' }] } },
        { titulo: T(lang, 'Luego un bajo cálido a contratiempo', 'Then a warm off-beat bass'), porque: T(lang, 'llena los huecos entre bombos', 'it fills the gaps between kicks'), concepto: T(lang, 'Contratiempo', 'Off-beat'), cambios: { pistas: [{ id: 'd4', nombre: 'Bass', tipo: 'bajo', codigo: 'n "~ c2 ~ c2" # s "supersaw" # lpf 900' }] } }] };
    const { page } = await open(b, { lang, state: sunday(lang), routes: { '/api/brainstorm': (body) => body.next ? { comentario: T(lang, '¡Ganas de bailar! El baile vive del pulso: un bombo regular en cada tiempo.', 'Wanting to dance! Dancing lives on the pulse: a steady kick on every beat.'), ejemplos: lang === 'es' ? ['Paseando tranquilo', 'Andando con prisa', 'Bailando', 'Corriendo', 'Sin pulso, flotando'] : ['Strolling calmly', 'Walking in a hurry', 'Dancing', 'Running', 'No pulse, floating'] } : plan } });
    await page.click('#btn-new'); await page.waitForTimeout(400);
    await page.click('.np-choice[data-m="ideas"]'); await page.waitForTimeout(700);
    await page.click('#wz-body .wz-examples button >> nth=0'); await page.click('#wz-body [data-a="next"]'); await page.waitForTimeout(1200);
    await shot(page, T(lang, 'lluvia-pregunta', 'brainstorm-question'), lang);
    for (let i = 0; i < 8; i++) { const nx = page.locator('#wz-body [data-a="next"]'); if (!(await nx.count())) break; await page.click('#wz-body .wz-examples button >> nth=0').catch(() => {}); await nx.click(); await page.waitForTimeout(900); }
    await page.waitForTimeout(800);
    await shot(page, T(lang, 'lluvia-plan', 'brainstorm-plan'), lang);
  },
  async instruments(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('.inst-card[data-i="drums"]'); await page.waitForTimeout(1500);
    await page.locator('#inst-body button', { hasText: T(lang, 'Caja', 'Snare') }).first().click().catch((e) => console.error('snare', e.message));
    await page.waitForTimeout(800);
    await shot(page, T(lang, 'instrumentos-bateria', 'instruments-drums'), lang);
    await page.click('#inst-body .inst-tabs button[data-i="sax"]'); await page.waitForTimeout(1500);
    await shot(page, T(lang, 'instrumentos-saxo', 'instruments-sax'), lang);
  },
  async courses(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-courses'); await page.waitForTimeout(800);
    await shot(page, T(lang, 'cursos', 'courses'), lang);
    await page.click('[data-start="merengue"]'); await page.waitForTimeout(800);
    await page.click('[data-cs="apply"]'); await page.waitForTimeout(500);
    await page.click('[data-cs="next"]'); await page.waitForTimeout(500);
    await page.click('[data-cs="apply"]'); await page.waitForTimeout(800);
    await shot(page, T(lang, 'curso-paso', 'course-step'), lang);
    for (let i = 2; i < 6; i++) { await page.click('[data-cs="next"]'); await page.waitForTimeout(300); await page.click('[data-cs="apply"]'); await page.waitForTimeout(500); }
    await tab(page, 'arrange'); await page.waitForTimeout(600);
    await shot(page, T(lang, 'curso-arreglo', 'course-arrangement'), lang);
    await page.click('[data-cs="next"]'); await page.waitForTimeout(300); await page.click('[data-cs="apply"]'); await page.waitForTimeout(600);
    await tab(page, 'mixer'); await page.waitForTimeout(600);
    await shot(page, T(lang, 'curso-completado', 'course-complete'), lang);
  },
  async tutorial(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-tour'); await page.waitForTimeout(800); await page.locator('.tour-card button', { hasText: T(lang, 'Empezar', 'Start') }).first().click().catch(() => {}); await page.waitForTimeout(700);
    for (let i = 0; i < 0; i++) { await page.locator('.tour-card button', { hasText: T(lang, 'Siguiente', 'Next') }).first().click().catch(() => {}); await page.waitForTimeout(500); }
    await shot(page, 'tutorial', lang);
  },

  async samples(b, lang) {
    const fs = { count: 1234, next: true, results: [
      ['Kick 909 punchy.wav', 'autoR', 0.4, 'CC0'], ['Deep house kick.wav', 'beatsmith', 0.5, 'CC BY 4.0'], ['Analog kick drum 02.aif', 'modular_mo', 0.6, 'CC0'],
      ['Kick acoustic room.wav', 'drumroom', 0.7, 'CC BY 4.0'], ['Lofi kick dusty.wav', 'tapehiss', 0.8, 'CC0'], ['Sub kick long.wav', 'lowend', 1.2, 'CC BY 4.0']].map(([name, author, duration, license_name], i) =>
      ({ id: 1000 + i, name, author, duration, license_name, url: 'https://freesound.org/', preview: '' })) };
    const { page } = await open(b, { lang, state: sunday(lang), routes: { '/api/samples/search': () => fs } });
    await page.route('**/api/config', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const r = await route.fetch(); const j = await r.json(); j.samples = { ...(j.samples || {}), freesound_key_set: true };
      await route.fulfill({ response: r, json: j });
    });
    await page.click('#btn-samples'); await page.waitForTimeout(1000);
    await page.locator('#sm-body .sm-types button', { hasText: /Hats|Platos/ }).first().click().catch(() => {}); await page.waitForTimeout(500);
    await shot(page, T(lang, 'biblioteca-samples', 'sample-library'), lang);
    await page.click('#sm-body .np-tabs [data-tab="mine"]'); await page.waitForTimeout(800);
    await page.click('#sm-body [data-a="wave"] >> nth=0').catch((e) => console.error('wave', e.message)); await page.waitForTimeout(1200);
    await shot(page, T(lang, 'recorte-samples', 'sample-trim'), lang);
    await page.click('#sm-body .np-tabs [data-tab="online"]'); await page.waitForTimeout(600);
    await page.click('#sm-body [data-a="quick"][data-q="kick"]'); await page.waitForTimeout(1200);
    await shot(page, T(lang, 'samples-online', 'samples-online'), lang);
    await page.click('#sm-body .np-tabs [data-tab="packs"]'); await page.waitForTimeout(800);
    await page.click('#sm-body [data-a="pack-open"] >> nth=0'); await page.waitForTimeout(6000);
    await shot(page, T(lang, 'packs-online', 'online-packs'), lang);
  },
  async github(b, lang) {
    const vers = [['Brighter chords in the drop', 'Acordes más brillantes en el drop', '2026-11-22T13:40:00Z'], ['Off-beat hats and claps', 'Hi-hats a contratiempo y palmas', '2026-11-22T12:55:00Z'],
      ['Warm supersaw bass', 'Bajo supersaw cálido', '2026-11-22T12:20:00Z'], ['First version: four-on-the-floor kick', 'Primera versión: bombo a negras', '2026-11-22T11:58:00Z']];
    const { page } = await open(b, { lang, state: { ...sunday(lang), github: { slug: 'sunday-house' } }, routes: {
      '/api/github/list': () => ({ songs: [{ slug: 'sunday-house', name: 'Sunday house', updated: '2026-11-22T13:40:00Z' }, { slug: 'neon-at-3am', name: 'Neon at 3 AM', updated: '2026-11-21T19:02:00Z' }] }),
      '/api/github/history': () => ({ slug: 'sunday-house', commits: vers.map(([en, es, date], i) => ({ sha: ('a1b2c3d4e5f6').slice(i) + '0000000'.slice(0, i) + 'f9e8d7', message: T(lang, es, en), date, url: 'https://github.com/' })) }),
    } });
    await page.click('#btn-projects'); await page.waitForTimeout(700);
    await page.click('[data-a="tab-github"]'); await page.waitForTimeout(900);
    await page.click('[data-a="versions"] >> nth=0').catch((e) => console.error('versions', e.message)); await page.waitForTimeout(900);
    await shot(page, T(lang, 'github-versiones', 'github-versions'), lang);
  },
  async skills(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-skills'); await page.waitForTimeout(1200);
    await shot(page, T(lang, 'panel-skills', 'skills-panel'), lang);
    await page.locator('#skills-body').evaluate((el) => { const h = [...el.querySelectorAll('h3,h4,h2')].find((x) => /Plugins/i.test(x.textContent)); (h || el).scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(500);
    await shot(page, T(lang, 'panel-plugins', 'plugins-panel'), lang);
  },
  async 'skill-route'(b, lang) {
    // Needs the music-composition plugin (v1.2.0+, with mc-tidal-studio) in my-plugins/
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-skills'); await page.waitForTimeout(1200);
    await page.locator('.pl-card[data-plugin="music-composition"]').evaluate((el) => {
      el.nextElementSibling.open = true;
      document.querySelector('.sk-card[data-name="mc-tidal-studio"]').classList.add('focus');
      el.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await shot(page, T(lang, 'ruta-tidal-studio', 'skill-route'), lang);
  },
  async 'skills-in-chat'(b, lang) {
    const { page } = await studioWithHat(b, lang);
    const el = page.locator('#chat .msg.assistant').last();
    await el.locator('[data-skills]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.locator('.panel.assistant').screenshot({ path: `${process.env.OUT}/${lang === 'es' ? 'es/skills-en-chat' : 'skills-in-chat'}.png` });
  },
  async reasoning(b, lang) {
    const reply = () => ({
      mensaje: T(lang, 'Te he montado una base de jazz: ride con swing, bajo caminante y acordes ii-V-I con séptimas. Escúchala y dime si la quieres más oscura.', "I've built a jazz base for you: swung ride, walking bass and ii-V-I chords with sevenths. Listen and tell me if you want it darker."),
      opciones: [T(lang, 'Más oscura', 'Darker'), T(lang, 'Añade una melodía de saxo', 'Add a sax melody')],
      cambios: { bpm: 132, pistas: [
        { id: 'd1', nombre: 'Ride', tipo: 'percusion', codigo: 'swingBy (1/3) 4 $ s "[~ hh]*4" # gain 0.8' },
        { id: 'd4', nombre: T(lang, 'Bajo caminante', 'Walking bass'), tipo: 'bajo', codigo: 'n "<[d2 f2 a2 c3] [g2 b2 d3 f3] [c2 e2 g2 b2]>" # s "superpiano" # lpf 800' },
        { id: 'd5', nombre: T(lang, 'Acordes ii-V-I', 'ii-V-I chords'), tipo: 'armonia', codigo: 'n "<d\'min7 g\'dom7 c\'maj7>" # s "superpiano" # room 0.3 # gain 0.75' }] },
      skills: { ...SK(lang), used: ['music-composition', 'livecoding'], decisions: [
        { aspect: 'armonia', skill: 'mc-harmony', rule: T(lang, 'Construye primero el esqueleto funcional (ii-V-I) y luego añade color: séptimas antes que tensiones.', 'Build the functional skeleton first (ii-V-I), then add colour: sevenths before tensions.'), applied: T(lang, 'd5: re menor 7 → sol dominante 7 → do mayor 7, un acorde por compás', 'd5: d minor 7 → g dominant 7 → c major 7, one chord per bar') },
        { aspect: 'tempo', skill: 'livecoding', rule: T(lang, 'setcps son ciclos por segundo: bpm/60/4 para cuatro tiempos por ciclo.', 'setcps takes cycles per second: bpm/60/4 for four beats per cycle.'), applied: 'setcps (132/60/4)' }] },
      trace: { seconds: 14, events: [
        { kind: 'step', t: 0.1, text: T(lang, 'Leyendo tu canción: 0 pistas, 124 BPM', 'Reading your song: 0 tracks, 124 BPM') },
        { kind: 'step', t: 0.2, text: T(lang, 'Skills elegidas: music-composition (armonía, groove), livecoding', 'Skills picked: music-composition (harmony, groove), livecoding') },
        { kind: 'step', t: 0.4, text: T(lang, 'Preguntando a Claude (claude-opus-5-5)', 'Asking Claude (claude-opus-5-5)') },
        { kind: 'thinking', text: T(lang, 'El alumno quiere jazz. Lo reconocible: swing, acordes con séptima y un bajo que camina. Un ii-V-I en do mayor es lo más didáctico. Tempo de swing medio, unos 132 BPM. El ride va en corcheas con swingBy (1/3) 4…', 'The student wants jazz. What makes it recognisable: swing, seventh chords and a walking bass. A ii-V-I in C major is the most teachable. Medium swing tempo, about 132 BPM. The ride goes in eighths with swingBy (1/3) 4…') },
        { kind: 'step', t: 13.6, text: T(lang, 'Respuesta lista: 3 pistas, 2 decisiones', 'Answer ready: 3 tracks, 2 decisions') }] },
    });
    const st = { ...sunday(lang), tracks: [], name: T(lang, 'Jazz de madrugada', 'Late night jazz'), chat: [] };
    const { page } = await open(b, { lang, state: st, routes: { '/api/chat': chatMock(lang, [[/./, reply]]) } });
    await page.fill('#chat-input', T(lang, 'Hazme una base de jazz', 'Make me a jazz base')); await page.press('#chat-input', 'Enter');
    await page.waitForTimeout(1800);
    await page.evaluate(() => { document.querySelector('#chat .msg.assistant:last-child').scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); });
    await shot(page, T(lang, 'decisiones-skills', 'skills-decisions'), lang);
    await page.evaluate(() => { document.querySelector('#chat .msg.assistant:last-child details.decisions')?.removeAttribute('open'); const t = document.querySelector('#chat .msg.assistant:last-child details.trace'); if (t) { t.open = true; t.scrollIntoView({ block: 'start' }); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    await shot(page, T(lang, 'razonamiento', 'reasoning'), lang);
  },

  // Plan por pasos: Maestro presenta un plan, lo aprobamos y lo hace paso a paso; el paso 3 tarda demasiado
  // (timeout) y se reintenta sin perder los dos primeros
  async plan(b, lang) {
    const P = {
      titulo: T(lang, 'Noche de salsa', 'Salsa night'),
      resumen: T(lang, 'Construimos una salsa como lo haría una orquesta: primero la clave y la percusión, luego el bajo tumbao, el montuno de piano y las trompetas encima.',
        'We build a salsa song the way a band would: clave and percussion first, then the tumbao bass, the piano montuno and the trumpets on top.'),
      pasos: [
        { titulo: T(lang, 'Clave y percusión', 'Clave and percussion'), que: T(lang, 'Clave de son 3-2 con congas: el corazón de la salsa.', 'Son clave 3-2 with congas: the heartbeat of salsa.'), aspecto: 'ritmo', pistas: ['d1', 'd2'] },
        { titulo: T(lang, 'Bajo tumbao', 'Tumbao bass'), que: T(lang, 'El bajo se adelanta al cambio de acorde: el empuje típico de la salsa.', 'The bass anticipates the chord change, the classic salsa push.'), aspecto: 'bajo', pistas: ['d3'] },
        { titulo: T(lang, 'Montuno de piano', 'Piano montuno'), que: T(lang, 'Un patrón sincopado de piano que se repite sobre Am - D7.', 'A repeating syncopated piano pattern over Am - D7.'), aspecto: 'armonia', pistas: ['d4'] },
        { titulo: T(lang, 'Mambo de trompetas', 'Trumpet mambo'), que: T(lang, 'Golpes cortos de trompeta que responden al piano (pregunta y respuesta).', 'Short trumpet stabs answering the piano (call and response).'), aspecto: 'melodia', pistas: ['d5'] },
        { titulo: T(lang, 'Arreglo: intro y mambo', 'Arrangement: intro and mambo'), que: T(lang, 'Con mask, las trompetas entran a los 8 compases.', 'Mask so the trumpets come in after 8 bars.'), aspecto: 'estructura', pistas: ['d5'] }],
    };
    const STEPS = [
      { mensaje: T(lang, 'Paso 1 hecho: clave de son 3-2 y congas. Fíjate en cómo la clave se repite cada compás.', 'Step 1 done: the 3-2 son clave plus congas. Listen to how the clave repeats every bar.'), cambios: { bpm: 96, pistas: [
        { id: 'd1', nombre: 'Clave', tipo: 'percusion', codigo: 's "rm(5,16,2)" # gain 1' }, { id: 'd2', nombre: 'Congas', tipo: 'percusion', codigo: 's "~ lt ~ [mt lt]" # gain 0.9' }] },
      explicacion: [{ fragmento: 'rm(5,16,2)', explicacion: T(lang, '5 golpes repartidos en 16 pasos: suena a clave.', '5 hits spread over 16 steps: a clave feel.') }] },
      { mensaje: T(lang, 'Paso 2 hecho: el bajo tumbao cae justo antes del primer tiempo.', 'Step 2 done: the tumbao bass lands just before the downbeat.'), cambios: { pistas: [
        { id: 'd3', nombre: 'Tumbao', tipo: 'bajo', codigo: 'n "~ ~ ~ a2 ~ ~ e2 ~" # s "superfm" # lpf 900' }] },
      explicacion: [{ fragmento: '~ ~ ~ a2', explicacion: T(lang, 'El bajo espera y empuja: eso es el tumbao.', "The bass waits, then pushes: that's the tumbao.") }] },
    ];
    let failed = false;
    const reply = (body) => {
      const ps = body.session && body.session.plan_paso;
      if (!ps) return { __delay: 500, body: { mensaje: T(lang, 'Este es mi plan para tu salsa. ¿Te parece bien o quieres cambiar algo?', "Here's my plan for your salsa. Does it look right, or do you want to change something?"), plan: P, skills: SK(lang) } };
      if (ps.i === 2 && !failed) { failed = true; return { __delay: 4000, __status: 504, body: { error: T(lang, 'La IA tardó demasiado en responder', 'The AI took too long to answer'), timeout: true, plan_paso: true } }; }
      return { __delay: 900, body: STEPS[ps.i] || { mensaje: 'ok' } };
    };
    const { page } = await open(b, { lang, state: { bpm: 120, tracks: [], chat: [], options: [], ideas: [], offline: false, step: 'libre' }, routes: { '/api/chat': reply } });
    await page.fill('#chat-input', T(lang, 'Hazme una canción de salsa entera, con piano, bajo y trompetas', 'Make me a whole salsa song with piano, bass and trumpets')); await page.press('#chat-input', 'Enter');
    await page.waitForSelector('.plan.propuesto'); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('#chat .msg.user:last-of-type')?.scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); });
    await shot(page, T(lang, 'plan-propuesto', 'plan-proposed'), lang);
    await page.click('[data-pl="start"]');
    await page.waitForSelector('.pl-step.haciendo >> nth=0'); await page.waitForFunction(() => document.querySelectorAll('.plan .pl-step.hecho').length === 2);
    await page.waitForTimeout(1200);
    await shot(page, T(lang, 'plan-en-marcha', 'plan-running'), lang);
    await page.waitForSelector('.pl-step.error'); await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelector('#chat .plan').scrollIntoView({ block: 'start' }); document.querySelector('#chat').scrollTop -= 70; window.scrollTo(0, 0); });
    await page.waitForTimeout(300);
    await shot(page, T(lang, 'plan-reintentar', 'plan-retry'), lang);
  },

  // Cancelar lo enviado: mientras Maestro piensa, «Cancelar» en el mensaje y el botón de enviar hecho cuadrado
  async cancel(b, lang) {
    const st = sunday(lang);
    const { page, ctx } = await open(b, { lang, state: st, routes: { '/api/chat': () => ({ __delay: 20000, body: { mensaje: 'late' } }), '/api/trace': () => ({ events: [
      { kind: 'step', text: T(lang, 'Leo tu mensaje y tu canción: 5 pistas, 124 bpm', 'Reading your message and your song: 5 tracks, 124 bpm'), t: 0.1 },
      { kind: 'step', text: T(lang, 'Elijo skills entre 54: mc-tidal-studio · siempre, mc-style-house', 'Picking skills out of 54: mc-tidal-studio · always, mc-style-house'), t: 0.2 },
      { kind: 'step', text: T(lang, 'Pregunto a Claude (tu suscripción)…', 'Asking Claude (your subscription)…'), t: 0.3 }], done: false, seconds: 14 }) } });
    await page.fill('#chat-input', T(lang, 'Rehaz toda la canción en estilo drum & bass', 'Redo the whole song as drum & bass')); await page.press('#chat-input', 'Enter');
    await page.waitForSelector('.chat-cancel'); await page.waitForTimeout(1500);
    await shot(page, T(lang, 'chat-cancelar', 'chat-cancel'), lang);
    await ctx.close();
  },

  async settings(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-settings'); await page.waitForTimeout(800);
    await page.click('#btn-cc-detect').catch(() => {}); await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector('#fs-claudecode').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot(page, T(lang, 'deteccion-claude', 'claude-detect'), lang);
    await page.click('#btn-diag'); await page.waitForTimeout(5000);
    await page.click('#btn-diag-models').catch(() => {}); await page.waitForTimeout(6000);
    await page.evaluate(() => document.querySelector('#diag').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot(page, T(lang, 'diagnostico', 'diagnostics'), lang);
  },
};
module.exports = { scenes, chatMock, studioWithHat, tab, SK };

if (require.main === module) (async () => {
  const b = await chromium.launch();
  const langs = (process.env.LANGS || 'en').split(',');
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
  for (const n of names) for (const l of langs) {
    try { await scenes[n](b, l); } catch (e) { console.error('FAIL', n, l, e.message.split('\n')[0]); }
  }
  await b.close();
})();
