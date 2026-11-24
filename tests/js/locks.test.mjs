// Candados por partes (web/locks.js). Ejecuta: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Los módulos de web/ son ES modules del navegador: se copian a .mjs con L() en español para probarlos en Node
const dir = mkdtempSync(join(tmpdir(), "ts-locks-"));
const src = readFileSync(new URL("../../web/locks.js", import.meta.url), "utf8")
  .replace(/import \{ L \} from "\.\/i18n\.js";/, "const L = (es) => es;");
writeFileSync(join(dir, "locks.mjs"), src);
const { partsOf, changedParts, guardChanges, blockedText } = await import(join(dir, "locks.mjs"));

test("partsOf separa ritmo, notas, sonido y efectos", () => {
  const p = partsOf('every 4 (fast 2) $ n "0 ~ 7 5" # s "superfm" # lpf 800 # room 0.2');
  assert.equal(p.sonido, "superfm");
  assert.equal(p.notas, "0 ~ 7 5");
  assert.match(p.ritmo, /every 4 \(fast 2\)/);
  assert.equal(p.efectos, "lpf 800 # room 0.2");
});

test("cambiar solo el sonido no toca el ritmo", () => {
  assert.deepEqual(changedParts('s "bd*2 ~ sn"', 's "808bd*2 ~ 808sd"'), ["sonido"]);
  assert.deepEqual(changedParts('s "bd*2 ~ sn"', 's "bd*4 ~ sn"'), ["ritmo"]);
  assert.deepEqual(changedParts('n "0 3" # s "superpiano"', 'n "0 5" # s "superpiano"'), ["notas"]);
  assert.deepEqual(changedParts('s "bd" # room 0.2', 's "bd" # room 0.4'), ["efectos"]);
  assert.deepEqual(changedParts('s "bd"  #  room 0.2', 's "bd" # room 0.2'), []);
});

test("guardChanges bloquea pistas enteras, partes y BPM", () => {
  const state = { bpm: 120, bpmLock: true, tracks: [
    { id: "d1", code: 's "bd*4"', lock: { all: true } },
    { id: "d2", code: 'n "0 3" # s "superpiano"', lock: { notas: true } },
    { id: "d3", code: 's "hh*8"' },
  ] };
  const { cambios, blocked } = guardChanges(state, { bpm: 128, eliminar: ["d1", "d3"], pistas: [
    { id: "d1", codigo: 's "bd*2"' },
    { id: "d2", codigo: 'n "0 3" # s "superpiano" # room 0.3' },
    { id: "d2", codigo: 'n "0 7" # s "superpiano"' },
    { id: "d5", codigo: 's "cp"' },
  ] });
  assert.equal(cambios.bpm, undefined);
  assert.deepEqual(cambios.eliminar, ["d3"]);
  assert.deepEqual(cambios.pistas.map((p) => p.codigo), ['n "0 3" # s "superpiano" # room 0.3', 's "cp"']);
  assert.equal(blocked.length, 4);
  assert.match(blockedText(blocked), /BPM/);
  assert.match(blockedText(blocked), /d2 \(notas\)/);
});
