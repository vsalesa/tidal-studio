// Capturas de 0.20.1 (guardar opciones como estilos de verdad): una conversación con 4 opciones de Maestro, la D
// elegida, y el alumno pide «guarda las otras tres como estilos». Se guarda sin IA y aparecen en Memoria → Mis estilos.
//   Arranca el estudio con una carpeta de datos vacía (TIDAL_STUDIO_DATA) y: BASE=http://127.0.0.1:8777 LANGS=en,es node v0201.js
const { chromium, open, shot, sunday, T } = require('./lib');

function chat(lang) {
  const opt = (t, te, d, de, id, name, namee, kind, code) => ({ titulo: T(lang, t, te), descripcion: T(lang, d, de), concepto: '',
    cambios: { pistas: [{ id, nombre: T(lang, name, namee), tipo: kind, codigo: code }], eliminar: [] } });
  return [
    { role: 'user', content: T(lang, 'Dale más vida al bajo', 'Give the bass more life') },
    { role: 'assistant', content: T(lang, 'Aquí tienes cuatro bajos distintos: escúchalos sobre tu canción y elige.', 'Here are four different basses: listen to them over your song and pick one.'),
      picked: 3, variantes: [
        opt('Bajo saltarín', 'Bouncy bass', 'Notas a contratiempo que empujan el groove.', 'Off-beat notes that push the groove.', 'd4', 'Bajo', 'Bass', 'bajo', 'n "~ c2 ~ c3" # s "supersaw" # lpf 1200'),
        opt('Sub profundo', 'Deep sub', 'Un bajo grave y redondo que se siente más que se oye.', 'A round low bass you feel more than hear.', 'd4', 'Bajo', 'Bass', 'bajo', 'n "c1 ~ ~ c1" # s "superfm" # lpf 300'),
        opt('Ácido 303', 'Acid 303', 'Filtro que se abre y se cierra, muy de los 90.', 'A filter that opens and closes, very 90s.', 'd4', 'Bajo', 'Bass', 'bajo', 'n "c2 c3 c2 eb2" # s "supersaw" # lpf (range 400 2000 sine)'),
        opt('Bajo funky', 'Funky bass', 'Notas cortas con síncopa, como un bajista de funk.', 'Short syncopated notes, like a funk bass player.', 'd4', 'Bajo', 'Bass', 'bajo', 'n "c2 ~ c2 eb2 ~ g2 ~ c3" # s "supersaw" # legato 0.4'),
      ] },
    { role: 'user', content: T(lang, 'Me quedo con la opción D: «Bajo funky».', 'I\'ll keep option D: «Funky bass».') },
    { role: 'assistant', content: T(lang, '¡Buena elección! La D, «Bajo funky», ya forma parte de tu canción.', 'Good choice! D, «Funky bass», is now part of your song.') },
  ];
}

const scenes = {
  async save(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang, { lang, chat: chat(lang) }) });
    const n = await page.locator('#chat .msg').count();
    await page.fill('#chat-input', T(lang, 'Guárdame las otras tres como estilos', 'Save the other three as styles'));
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => document.querySelectorAll('#chat .msg').length > n + 1, n, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.locator('#chat .variants').last().scrollIntoViewIfNeeded();
    await page.evaluate(() => { const c = document.querySelector('#chat'); c.scrollTop = c.scrollHeight; });
    await shot(page, T(lang, 'estilos-desde-opciones', 'styles-from-options'), lang);
    await page.locator('#chat .va-style').first().scrollIntoViewIfNeeded();
    await shot(page, T(lang, 'estilos-en-tarjetas', 'styles-on-cards'), lang);
    await page.getByRole('button', { name: T(lang, 'Abrir Mis estilos', 'Open My styles') }).last().click();
    await page.waitForTimeout(1200);
    await shot(page, T(lang, 'mis-estilos', 'my-styles'), lang);
  },
};

(async () => {
  const langs = (process.env.LANGS || 'en').split(',');
  const b = await chromium.launch();
  for (const l of langs) {
    try { await scenes.save(b, l); } catch (e) { console.error('FAIL', l, e.message.split('\n')[0]); }
  }
  await b.close();
})();
