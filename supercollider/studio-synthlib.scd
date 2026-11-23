// Sintetizadores propios de Tidal Studio (prefijo ts_). Solo usan UGens de serie: suenan en
// cualquier SuperCollider, sin sc3-plugins. Se tocan como los de SuperDirt:
//     d1 $ n "c'maj e'min" # s "ts_rhodes"
// Lo carga start_superdirt.scd después de studio-synths.scd.
(
var outp = { |sig, p, env| DirtPan.ar(sig, ~dirt.numChannels, p, env) };

// Piano eléctrico FM (púa + resonador, tipo Rhodes)
SynthDef(\ts_rhodes, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, velocity=1, tone=0.4|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.002, sustain, 0.4], -4), doneAction: 2);
    var menv = EnvGen.kr(Env.perc(0.001, 1.2, 1, -6));
    var mod = SinOsc.ar(f * 14, 0, f * tone * 2 * menv);
    var sig = SinOsc.ar(f + mod) * EnvGen.ar(Env.perc(0.002, 3 + (220 / f), 1, -5));
    sig = sig + (SinOsc.ar(f * 2) * 0.15 * EnvGen.ar(Env.perc(0.001, 0.6)));
    sig = (sig * 0.35 * velocity.clip(0.1, 2)).tanh;
    Out.ar(out, outp.(sig * SinOsc.kr(4.5).range(0.85, 1), pan, env));
}).add;

// Órgano de barras: 9 armónicos con su «click» y un vibrato suave
SynthDef(\ts_organ, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, voice=0|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.005, sustain, 0.08]), doneAction: 2);
    var bars = Select.kr(voice.clip(0, 2), [[8, 8, 8, 0, 0, 0, 0, 0, 0], [8, 8, 0, 4, 0, 0, 0, 0, 0], [8, 8, 8, 8, 8, 8, 8, 8, 8]]) / 8;
    var ratios = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
    var vib = SinOsc.kr(6.5, 0, 0.003, 1);
    var sig = Mix(SinOsc.ar(f * ratios * vib) * bars) / 4;
    sig = sig + (BPF.ar(WhiteNoise.ar, 3000, 0.5) * EnvGen.ar(Env.perc(0.001, 0.01)) * 0.2);
    Out.ar(out, outp.(sig * 0.5, pan, env));
}).add;

// Cuerda punteada (Karplus-Strong): guitarra, arpa, koto…
SynthDef(\ts_pluck, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, decay=2, coef=0.3|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.001, sustain + decay, 0.05]), doneAction: 2);
    var sig = Pluck.ar(WhiteNoise.ar(0.6), Impulse.kr(0), 0.05, f.reciprocal, decay, coef);
    sig = LPF.ar(sig, (f * 6).clip(200, 16000));
    Out.ar(out, outp.(sig, pan, env));
}).add;

// Cuerdas analógicas (tipo Solina): sierras desafinadas con un chorus
SynthDef(\ts_strings, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, attack=0.25, release=0.6, cutoff=3500|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [attack, sustain, release], -2), doneAction: 2);
    var sig = Mix(Saw.ar(f * [1, 1.004, 0.996, 2.002] * SinOsc.kr([0.6, 0.83, 0.71, 0.5], 0, 0.002, 1))) * 0.2;
    sig = LPF.ar(sig, cutoff) + DelayC.ar(sig, 0.03, SinOsc.kr(0.3).range(0.008, 0.02), 0.4);
    Out.ar(out, outp.(sig * 0.5, pan, env));
}).add;

// Pad cálido con chorus
SynthDef(\ts_pad, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, attack=0.6, release=1.5, cutoff=1800|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [attack, sustain, release], -2), doneAction: 2);
    var sig = Mix(VarSaw.ar(f * [1, 1.003, 0.997, 0.5], 0, SinOsc.kr([0.2, 0.31, 0.27, 0.13]).range(0.2, 0.8))) * 0.2;
    sig = RLPF.ar(sig, cutoff * SinOsc.kr(0.07).range(0.7, 1.3), 0.4);
    Out.ar(out, outp.(sig * 0.6, pan, env));
}).add;

// Metales analógicos (filtro que se abre al atacar)
SynthDef(\ts_brass, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 0.8, 0], [0.04, sustain, 0.15], -3), doneAction: 2);
    var fenv = EnvGen.kr(Env([0.3, 1, 0.6], [0.08, 0.4]));
    var sig = Mix(Saw.ar(f * [1, 1.005])) * 0.3;
    sig = RLPF.ar(sig, (f * 8 * fenv).clip(200, 12000), 0.5);
    Out.ar(out, outp.(sig * 0.6, pan, env));
}).add;

// Campana FM
SynthDef(\ts_bell, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, ratio=3.5|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env.perc(0.001, 2.5 + sustain, 1, -5), doneAction: 2);
    var mod = SinOsc.ar(f * ratio, 0, f * 2 * EnvGen.kr(Env.perc(0.001, 1.5)));
    var sig = SinOsc.ar(f + mod) * 0.3;
    Out.ar(out, outp.(sig, pan, env));
}).add;

// Bajo ácido (tipo TB-303): sierra o cuadrada con filtro resonante que se cierra
SynthDef(\ts_acid, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, cutoff=900, resonance=0.6, voice=0|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.003, sustain, 0.03]), doneAction: 2);
    var fenv = EnvGen.kr(Env.perc(0.002, 0.25 + sustain, 1, -4));
    var sig = Select.ar(voice.clip(0, 1), [Saw.ar(f), Pulse.ar(f, 0.5)]);
    sig = RLPF.ar(sig, (cutoff * (0.4 + (3 * fenv))).clip(60, 12000), (1 - resonance).clip(0.05, 1));
    Out.ar(out, outp.((sig * 0.5).tanh, pan, env));
}).add;

// Sub-bajo 808: seno con caída de tono y un poco de saturación
SynthDef(\ts_sub, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, drive=1.5|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 0.8, 0], [0.002, sustain, 0.2], -3), doneAction: 2);
    var sig = SinOsc.ar(f * EnvGen.kr(Env([2, 1], [0.04], -4)));
    Out.ar(out, outp.((sig * drive).tanh * 0.6, pan, env));
}).add;

// Bajo wobble (dubstep): el filtro sube y baja a la velocidad de «rate»
SynthDef(\ts_wobble, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, rate=4|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.005, sustain, 0.05]), doneAction: 2);
    var sig = Mix(Saw.ar(f * [1, 1.01, 0.5])) * 0.3;
    sig = RLPF.ar(sig, LFTri.kr(rate).exprange(150, 4000), 0.3);
    Out.ar(out, outp.((sig * 1.5).tanh * 0.5, pan, env));
}).add;

// Coro sintetizado: pulso + 3 formantes de vocal (a, e, i, o, u con «vowel» 0..4)
SynthDef(\ts_choir, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, vowel=0|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.3, sustain, 0.6], -2), doneAction: 2);
    var forms = Select.kr(vowel.clip(0, 4), [[800, 1150, 2900], [400, 1600, 2700], [350, 1700, 2700], [450, 800, 2830], [325, 700, 2530]]);
    var src = Mix(Saw.ar(f * [1, 1.006, 0.994] * SinOsc.kr(5, 0, 0.004, 1))) * 0.3;
    var sig = Mix(BPF.ar(src, forms, 0.08, [1, 0.6, 0.25])) * 3;
    Out.ar(out, outp.(sig * 0.6, pan, env));
}).add;

// Pad «Juno»: pulso con modulación de anchura y chorus
SynthDef(\ts_juno, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, cutoff=2500|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.15, sustain, 0.8], -2), doneAction: 2);
    var sig = Pulse.ar(f, SinOsc.kr(0.4).range(0.2, 0.5)) + (Saw.ar(f * 0.5) * 0.3);
    sig = LPF.ar(sig, cutoff);
    sig = sig + DelayC.ar(sig, 0.02, SinOsc.kr(0.5).range(0.004, 0.012));
    Out.ar(out, outp.(sig * 0.25, pan, env));
}).add;

// Solista analógico (tipo Minimoog): dos sierras, filtro y algo de portamento
SynthDef(\ts_lead, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, cutoff=2400, resonance=0.3|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 0.8, 0], [0.01, sustain, 0.1], -3), doneAction: 2);
    var sig = Mix(Saw.ar(f * [1, 1.008, 0.5])) * 0.3;
    sig = RLPF.ar(sig, (cutoff * EnvGen.kr(Env([0.5, 1.5, 1], [0.02, 0.3]))).clip(100, 15000), (1 - resonance).clip(0.1, 1));
    Out.ar(out, outp.((sig * 1.2).tanh * 0.5 * SinOsc.kr(5.5, 0, 0.05, 1), pan, env));
}).add;

// Marimba modal: resonadores afinados excitados por un golpe
SynthDef(\ts_marimba, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env.perc(0.001, 1.8, 1, -4), doneAction: 2);
    var exc = EnvGen.ar(Env.perc(0.0005, 0.006)) * PinkNoise.ar(0.5);
    var sig = Klank.ar(`[[1, 3.93, 9.2], [1, 0.3, 0.1], [1.2, 0.3, 0.08] * (440 / f).sqrt.clip(0.3, 2)], exc, f);
    Out.ar(out, outp.(sig * 0.6, pan, env));
}).add;

// Flauta sintetizada: seno con soplido
SynthDef(\ts_flute, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 0.9, 0], [0.06, sustain, 0.12], -2), doneAction: 2);
    var vib = SinOsc.kr(5, 0, 0.006 * EnvGen.kr(Env([0, 0, 1], [0.2, 0.4])), 1);
    var sig = SinOsc.ar(f * vib) + (SinOsc.ar(f * 2 * vib) * 0.15);
    sig = sig + (BPF.ar(WhiteNoise.ar, f * 2, 0.3) * 0.12);
    Out.ar(out, outp.(sig * 0.35, pan, env));
}).add;

"Tidal Studio: sintetizadores ts_ listos.".postln;
)
