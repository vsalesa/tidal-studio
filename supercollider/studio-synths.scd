// Sintetizadores extra de Tidal Studio. Lo carga start_superdirt.scd después de crear ~dirt.
//
// 1) SuperDirt solo carga sus sintetizadores "super…" (superpiano, superpwm, supersaw…)
//    si están instalados los sc3-plugins. En macOS y Windows SuperCollider viene sin ellos,
//    así que el piano, el bajo y casi todos los sintes se quedaban MUDOS.
//    Aquí los cargamos uno a uno: los osciladores DPW de los plugins se cambian por los de serie
//    (Saw, Pulse: suenan casi igual) y solo saltamos los que de verdad necesitan un plugin.
// 2) Si falta el piano de los plugins (MdaPiano), definimos un \superpiano propio sin plugins.
// 3) Siempre añadimos \supertrumpet: Tidal no trae trompeta.
(
var missing = { |code|
    code.findRegexp("[A-Z][A-Za-z0-9_]*\\.(ar|kr|ir)\\b")
        .select { |m| m[1].endsWith(".ar") or: { m[1].endsWith(".kr") } or: { m[1].endsWith(".ir") } }
        .collect { |m| m[1].split($.).first }
        .asSet.select { |name| name.asSymbol.asClass.isNil }
};
// Osciladores de los plugins que tienen un equivalente de serie
var swaps = [["SawDPW", "Saw"], ["PulseDPW", "Pulse"]];
var loadBlocks = { |path|
    var block = nil, loaded = 0, skipped = List[];
    File.readAllString(path).split($\n).do { |line|
        if(block.isNil) {
            if(line.beginsWith("(")) { block = List[line] };
        } {
            block.add(line);
            if(line.findRegexp("^\\);?[ \t\r]*$").notEmpty) {
                var code = block.join("\n"), miss, name;
                swaps.do { |sw| if(sw[0].asSymbol.asClass.isNil) { code = code.replace(sw[0] ++ ".", sw[1] ++ ".") } };
                miss = missing.(code);
                name = code.findRegexp("SynthDef\\(\\\\([A-Za-z0-9_]+)");
                name = if(name.notEmpty) { name[1][1] } { "?" };
                if(miss.isEmpty) {
                    if(code.interpret.notNil) { loaded = loaded + 1 } { skipped.add(name) };
                } { skipped.add(name ++ " (" ++ miss.asArray.join(", ") ++ ")") };
                block = nil;
            };
        };
    };
    [loaded, skipped]
};

if(\MembraneHexagon.asClass.isNil) {
    var extra = SuperDirt.filenameSymbol.asString.dirname.dirname +/+ "library" +/+ "default-synths-extra.scd";
    "Tidal Studio: faltan los sc3-plugins; cargo los sintetizadores de SuperDirt que no los necesitan.".postln;
    if(File.exists(extra)) {
        var res = loadBlocks.(extra);
        ("Tidal Studio: % sintetizadores extra cargados. Sin plugins no hay: %".format(res[0], res[1].join(", "))).postln;
    } { ("Tidal Studio: no encuentro " ++ extra).postln };
};

// Piano sin plugins: cuerdas (parciales algo inarmónicas, dos cuerdas desafinadas) + golpe del martillo.
if(\MdaPiano.asClass.isNil) {
    SynthDef(\superpiano, { |out, sustain=1, pan, velocity=1, detune=0.1, muffle=1, stereo=0.2, freq=440, accelerate=0, speed=1|
        var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
        var vel = velocity.clip(0.05, 2);
        var dec = (6 * (f / 261.63).pow(-0.5)).clip(0.4, 10);
        var env = EnvGen.ar(Env([0, 1, 1, 0], [0.002, sustain, 0.3], -3), doneAction: 2);
        var sound = Mix.fill(8, { |i|
            var k = i + 1, fk = f * k * (1 + (0.0004 * k * k)).sqrt, d = detune * 0.002;
            (SinOsc.ar(fk * (1 + d), Rand(0, 2pi)) + SinOsc.ar(fk * (1 - d), Rand(0, 2pi)))
                * (k ** -1.3) * EnvGen.ar(Env.perc(0.003, dec / (k ** 0.7), 1, -4))
        });
        var hammer = BPF.ar(WhiteNoise.ar, (f * 3).clip(200, 8000), 0.6) * EnvGen.ar(Env.perc(0.001, 0.03)) * 0.6;
        sound = LPF.ar(sound + hammer, (f * (3 + (6 * vel)) / muffle.max(0.1)).clip(300, 18000));
        sound = (sound * 0.22 * vel).tanh;
        Out.ar(out, DirtPan.ar(sound, ~dirt.numChannels, pan, env));
    }).add;
    "Tidal Studio: superpiano sin plugins listo.".postln;
};

// Sustitutos sencillos de superchip (AY) y superfm (FM7) cuando faltan los plugins
if(\AY.asClass.isNil) {
    SynthDef(\superchip, { |out, sustain=1, pan, freq, rate=1, slide=0, pitch2=2, pitch3=3, accelerate, voice=0, speed=1|
        var env = EnvGen.ar(Env.linen(0.01, 0.98, 0.01, 1, -1), timeScale: sustain, doneAction: 2);
        var f = (freq + wrap2(slide * 100 * Line.kr(-1, 1 + (2 * rate - 2), sustain), slide * 100)) * DirtFreqScale.kr(speed, accelerate, sustain);
        var va = voice < 0.5, vb = ((2 * voice) % 1) < 0.5, vc = ((4 * voice) % 1) < 0.5;
        var sound = (LFPulse.ar(f) * va) + (LFPulse.ar(f * pitch2) * vb) + (LFPulse.ar(f * pitch3) * vc);
        sound = tanh(LeakDC.ar(sound) * 0.6) * 0.5;
        Out.ar(out, DirtPan.ar(sound, ~dirt.numChannels, pan, env));
    }).add;
};
if(\FM7.asClass.isNil) {
    SynthDef(\superfm, { |out, sustain=1, pan, freq=440, accelerate=0, speed=1, ratio2=1, mod12=1|
        var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
        var env = EnvGen.ar(Env([0, 1, 0.7, 0], [0.005, 0.2, sustain], -3), doneAction: 2);
        var menv = EnvGen.kr(Env([0, 1, 0.3], [0.005, 0.5], -4));
        var sound = SinOsc.ar(f, SinOsc.ar(f * ratio2) * mod12 * 2.5 * menv) * 0.3;
        Out.ar(out, DirtPan.ar(sound, ~dirt.numChannels, pan, env));
    }).add;
};

// Trompeta: dientes de sierra con filtro que se abre al soplar, subida de afinación al atacar y vibrato tardío.
// Úsala como cualquier sinte:  n "c5 e5 g5" # s "supertrumpet"   (extra: velocity, vibrato, muffle)
SynthDef(\supertrumpet, { |out, sustain=1, pan, freq=440, accelerate=0, speed=1, velocity=1, vibrato=0.5, vrate=5.5, muffle=1|
    var vel = velocity.clip(0.1, 1.5);
    var scoop = EnvGen.kr(Env([0.97, 1], [0.05], 2));
    var vib = 1 + (SinOsc.kr(vrate) * 0.006 * vibrato * EnvGen.kr(Env([0, 0, 1], [0.25, 0.3])));
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain) * scoop * vib;
    var env = EnvGen.ar(Env([0, 1, 0.8, 0.8, 0], [0.03, 0.08, (sustain - 0.11).max(0.01), 0.12], -2), doneAction: 2);
    var bright = EnvGen.kr(Env([0.2, 1, 0.7], [0.04, 0.2]));
    var cutoff = (f * (2 + (7 * bright * vel)) / muffle.max(0.1)).clip(150, 14000);
    var sound = (Saw.ar(f * [1, 1.003]).sum * 0.5) + (Pulse.ar(f, 0.3) * 0.2);
    sound = RLPF.ar(sound, cutoff, 0.6) + (BPF.ar(PinkNoise.ar, f * 2, 0.4) * 0.04);
    sound = (sound * 1.5).tanh * 0.55;
    Out.ar(out, DirtPan.ar(sound, ~dirt.numChannels, pan, env));
}).add;
"Tidal Studio: supertrumpet listo.".postln;
)
