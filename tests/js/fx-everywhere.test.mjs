// Efectos iguales en Pistas, Bloques y Código (web/blocks.js + web/edit.js). Ejecuta: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, writeFileSync, mkdtempSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Copiamos web/ como .mjs, con L() en inglés, para importar los módulos del navegador en Node
const dir = mkdtempSync(join(tmpdir(), "ts-fx-"));
cpSync(new URL("../../web/", import.meta.url), dir, { recursive: true });
writeFileSync(join(dir, "i18n.js"), "export const L = (es, en) => en; export const lang = () => 'en';");
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const { songBlocksHTML, fxChipHTML } = await import(join(dir, "blocks.js"));
const { effectsOf, applyEdit } = await import(join(dir, "edit.js"));

const CODE = 'slow 2 $ n "c e g b" # s "superpiano" # lpf 1800 {- # delay 0.4 -} # legato 1.2';
const fakeIcon = () => "";
const blocks = (code, fxAdd = () => "") => songBlocksHTML({ bpm: 96, name: "x", tracks: [{ id: "d1", name: "Keys", kind: "armonia", code }] },
  { icon: fakeIcon, kindColor: () => "", kindName: (k) => k, fxAdd });

test("Bloques usa la misma ficha (interruptor + editar) que Pistas y Código", () => {
  const html = blocks(CODE);
  for (const e of effectsOf(CODE)) {
    const chip = fxChipHTML(e.key, e);
    assert.match(chip, /class="fx-sw/, `${e.name} has an on/off switch`);
    assert.match(chip, new RegExp(`data-fx-open="${e.key.replace(/[|.]/g, "\\$&")}"`), `${e.name} opens the editor`);
    assert.ok(html.includes(`data-fx="${e.key}"`), `Blocks has the switch for ${e.name}`);
    assert.ok(html.includes(`data-fx-open="${e.key}"`), `Blocks has the editor for ${e.name}`);
  }
});

test("los efectos apagados se ven apagados en todas las vistas", () => {
  const delay = effectsOf(CODE).find((e) => e.name === "delay");
  assert.equal(delay.off, true);
  assert.match(fxChipHTML(delay.key, delay), /fx-chip\s+off/);
  assert.match(blocks(CODE), /bk-param off|fx-chip bk-param off/);
});

test("el «+ efecto» también sale en Bloques (aunque la pista no tenga efectos)", () => {
  const html = blocks('s "bd*4"', (k) => `<select class="fx-add" data-fx-add="${k}"></select>`);
  assert.match(html, /class="fx-add" data-fx-add="\|src"/);
});

test("encender/apagar y añadir usan las mismas claves en todas las vistas", () => {
  const lpf = effectsOf(CODE).find((e) => e.name === "lpf");
  const off = applyEdit(CODE, lpf.key, "toggle");
  assert.match(off, /\{- # lpf 1800 -\}/);
  assert.equal(applyEdit(off, lpf.key, "toggle"), CODE);
  const added = applyEdit('s "bd*4" # gain 1', "|src", "addParam", "room", "0.3");
  assert.equal(added, 's "bd*4" # gain 1 # room 0.3');
});
