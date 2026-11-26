// Tiempo real y longitud de canción (web/timefmt.js). Ejecuta: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";
const { cycleSecs, fmtTime, songCycles } = await import("../../web/timefmt.js");

test("1 ciclo a 120 BPM = 2 s; a 90 BPM = 2.667 s", () => {
  assert.equal(cycleSecs(120), 2);
  assert.ok(Math.abs(cycleSecs(90) - 8 / 3) < 1e-9);
});
test("fmtTime mm:ss", () => {
  assert.equal(fmtTime(0), "0:00");
  assert.equal(fmtTime(83.4), "1:23");
  assert.equal(fmtTime(59.99), "0:59");
  assert.equal(fmtTime(83.45, 1), "1:23.5");
  assert.equal(fmtTime(5, 1), "0:05.0");
});
test("songCycles: mcm de máscaras", () => {
  assert.equal(songCycles([]), 1);
  assert.equal(songCycles([8, 16]), 16);
  assert.equal(songCycles([6, 4]), 12);
  assert.equal(songCycles([997, 991]), 256);
});
