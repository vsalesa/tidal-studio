// Capturas de 0.17 (géneros): cursos nuevos (reggae/dub, boom bap, afrobeat, bachata), variantes de cumbia elegidas
// antes del ritmo, aviso de sonidos que aún no suenan, «Elegir sonido de oído» dentro del curso y la forma del curso
// en la partitura.
//   OUT=../screenshots node v017.js          (inglés)     LANGS=es OUT=../screenshots node v017.js
// Necesita el paquete del Groove MIDI Dataset en references/ (o internet) para el baterista real.
const { chromium, open, shot, T } = require('./lib');

const blank = { bpm: 120, name: '', step: 'libre', tracks: [], chat: [], options: [], ideas: [], learnedMusic: [], offline: false };
async function startCourse(page, id) {
  await page.click('#btn-courses').catch(async () => { await page.evaluate(() => document.querySelector('[data-courses], #btn-courses')?.click()); });
  await page.waitForSelector(`#courses [data-start="${id}"]`, { timeout: 8000 });
  await page.locator(`#courses [data-start="${id}"]`).scrollIntoViewIfNeeded();
  await page.click(`#courses [data-start="${id}"]`);
  await page.waitForSelector('#course-dock:not([hidden]) .cs-step', { timeout: 8000 });
  await page.waitForTimeout(1200);
}
async function apply(page, n) {
  for (let i = 0; i < n; i++) {
    await page.click('#course-dock [data-cs="apply"]'); await page.waitForTimeout(900);
    if (i < n - 1) { await page.click('#course-dock [data-cs="next"]'); await page.waitForTimeout(400); }
  }
}

const scenes = {
  async list(b, lang) {
    const { page } = await open(b, { lang, state: blank });
    await page.click('#btn-courses'); await page.waitForTimeout(700);
    await page.locator('#courses [data-start="reggae"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => { const c = document.querySelector('#courses .cs-card:has([data-start="reggae"])'); c && c.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    console.log('courses:', await page.locator('#courses .cs-card').count(), 'new:', await page.locator('#courses .cs-new').count());
    await shot(page, T(lang, 'cursos-nuevos', 'new-courses'), lang);
  },
  async cumbia(b, lang) {
    const { page } = await open(b, { lang, state: blank });
    await startCourse(page, 'cumbia');
    await page.click('#course-dock [name="cs-variant"][value="villera"]'); await page.waitForTimeout(1500);
    console.log('variants:', await page.locator('#course-dock .cs-variants label').count(), 'bpm:', await page.inputValue('#bpm'),
      'warn:', await page.locator('#course-dock .cs-warn').count());
    await shot(page, T(lang, 'cumbia-variantes', 'cumbia-variants'), lang);
  },
  async score(b, lang) {
    const { page } = await open(b, { lang, state: blank });
    await startCourse(page, 'bachata');
    await apply(page, 6);   // güira, bongó, bajo, segunda guitarra, requinto, arreglo
    await page.click('#btn-score'); await page.waitForTimeout(800);
    console.log('sections:', await page.locator('#score .sc-sec').count(), 'parts:', await page.locator('#score .sc-part').count());
    await shot(page, T(lang, 'curso-partitura', 'course-score'), lang);
  },
  async ear(b, lang) {
    const { page } = await open(b, { lang, state: blank });
    await startCourse(page, 'afrobeat');
    await apply(page, 3);   // batería, campana y shekere, bajo
    const ear = page.locator('#course-dock [data-ear="d5"]');
    console.log('ear buttons:', await page.locator('#course-dock [data-ear]').count());
    await ear.click(); await page.waitForSelector('.variants .va-card', { timeout: 8000 }); await page.waitForTimeout(900);
    await page.evaluate(() => { document.querySelector('.variants')?.closest('.msg')?.scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); });
    await page.waitForTimeout(300);
    console.log('compare cards:', await page.locator('.variants .va-card').count());
    await shot(page, T(lang, 'curso-sonido-de-oido', 'course-sound-by-ear'), lang);
  },
  async reggae(b, lang) {
    const { page } = await open(b, { lang, state: blank });
    await startCourse(page, 'reggae');
    await apply(page, 6);
    await page.click('#course-dock [data-cs="next"]').catch(() => {}); await page.waitForTimeout(500);
    await shot(page, T(lang, 'curso-reggae', 'course-reggae'), lang);
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
