// Capturas de 0.13.0: librería única, cambiar un instrumento, enviar a mi teclado (MIDI out) y aviso de audio.
//   OUT=../screenshots node v013.js            (inglés)    LANGS=es OUT=../screenshots node v013.js
// El estudio tiene que estar arrancado con fake-sclang (ver README.md): la salida MIDI se simula mandando
// al servidor los mismos OSC que mandaría studio-midi.scd.
const dgram = require('dgram');
const { chromium, open, shot, sunday, T } = require('./lib');

function osc(address, ...args) {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
  const str = (s) => pad(Buffer.from(String(s), 'utf8'));
  return Buffer.concat([str(address), str(',' + 's'.repeat(args.length)), ...args.map(str)]);
}
const send = (addr, ...args) => new Promise((ok) => { const s = dgram.createSocket('udp4'); s.send(osc(addr, ...args), 57140, '127.0.0.1', () => { s.close(); ok(); }); });
const PIANO = 'Digital Piano · USB MIDI';

async function selectIn(page, sel, word) {
  const ta = page.locator(sel).first();
  const code = await ta.inputValue(); const i = code.indexOf(word);
  await ta.focus(); await ta.evaluate((el, [i, n]) => el.setSelectionRange(i, i + n), [i, word.length]);
  const box = await ta.boundingBox();
  await page.mouse.move(box.x + 160, box.y + 14); await page.mouse.up();
  await page.waitForTimeout(1500);
}

const scenes = {
  async library(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.click('#btn-samples'); await page.waitForTimeout(1500);
    await page.fill('.lb-q', T(lang, 'piano', 'piano')); await page.waitForTimeout(600);
    await shot(page, T(lang, 'libreria', 'library'), lang);
  },
  async replace(b, lang) {
    const { page } = await open(b, { lang, state: sunday(lang) });
    await page.evaluate(() => document.querySelector('#tracks .track[data-id="d5"]')?.scrollIntoView({ block: 'start' }));
    await selectIn(page, '#tracks .track[data-id="d5"] textarea', 'superpiano');
    await shot(page, T(lang, 'cambiar-instrumento', 'replace-sound'), lang);
    await page.fill('.rp-q', T(lang, 'organo', 'organ')); await page.waitForTimeout(900);
    await shot(page, T(lang, 'cambiar-instrumento-buscar', 'replace-sound-search'), lang);
  },
  async 'midi-out'(b, lang) {
    const st = sunday(lang); st.tracks[4].code = 'n "<c\'min7 a\'maj7 f\'maj7 g\'dom7>" # s "midi" # room 0.4 # gain 0.8 # midichan 0'; st.tracks[4].kbWas = 'superpiano';
    const { page } = await open(b, { lang, state: st, local: { 'tidal-studio-midi': { out: PIANO, outch: 0, prog: 4, clock: true } } });
    await send('/ts/mididevs', PIANO); await send('/ts/midiouts', PIANO); await send('/ts/midiout', PIANO);
    await page.click('#btn-midi'); await page.waitForTimeout(1500);
    await page.click('#mididock [data-a=out-toggle]'); await page.waitForTimeout(800);
    await shot(page, T(lang, 'midi-enviar', 'midi-out'), lang);
  },
  async 'audio-bar'(b, lang) {
    const audio = { out: '', rate: 48000, inputs: 0, devices: ['MacBook Air Speakers', 'Digital Piano'], boot_devices: ['MacBook Air Speakers'],
      problem: 'devices-changed', added: ['Digital Piano'], removed: [], rev: 3, chosen: '', running: true, ready: true };
    const { page } = await open(b, { lang, state: sunday(lang), routes: { '/api/audio': () => audio } });
    await send('/ts/midiplug', PIANO);
    await page.waitForTimeout(5000);
    await shot(page, T(lang, 'aviso-audio', 'audio-bar'), lang);
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
