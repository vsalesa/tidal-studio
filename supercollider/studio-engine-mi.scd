// Mi-UGens (Mutable Instruments) como sintetizadores de SuperDirt. Lo carga studio-engines.scd
// solo si el plugin está instalado (si no, SuperCollider ni siquiera podría leer este archivo).
(
var dirt = ~dirt;
// ------------------------------------------------------------ 1) Mi-UGens
SynthDef(\plaits, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, engine=0, harm=0.5, timbre=0.5, morph=0.5,
    decay=0.5, lpg=0.5, level=1|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.001, sustain, 0.05]), doneAction: 2);
    var sig = MiPlaits.ar(f.cpsmidi, engine, harm, timbre, morph, trigger: Impulse.kr(0), level: level,
        decay: decay, lpg_colour: lpg);
    Out.ar(out, DirtPan.ar(sig[0] * 0.8, dirt.numChannels, pan, env));
}).add;
SynthDef(\braids, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, engine=0, timbre=0.5, color=0.5|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.003, sustain, 0.05]), doneAction: 2);
    var sig = MiBraids.ar(f.cpsmidi, timbre, color, engine, trigger: Impulse.kr(0));
    Out.ar(out, DirtPan.ar(sig * 0.5, dirt.numChannels, pan, env));
}).add;
SynthDef(\rings, { |out, sustain=1, pan, freq=440, speed=1, accelerate=0, engine=0, structure=0.25, brightness=0.5,
    damping=0.7, position=0.25|
    var f = freq * DirtFreqScale.kr(speed, accelerate, sustain);
    var env = EnvGen.ar(Env([0, 1, 1, 0], [0.001, sustain + 1.5, 0.1]), doneAction: 2);
    var sig = MiRings.ar(PinkNoise.ar * EnvGen.ar(Env.perc(0.001, 0.01)), Impulse.kr(0), f.cpsmidi, structure,
        brightness, damping, position, model: engine);
    Out.ar(out, DirtPan.ar(sig[0] * 0.8, dirt.numChannels, pan, env));
}).add;
"Tidal Studio: Mi-UGens (plaits, braids, rings) listos.".postln;
)
