// Teclado MIDI (piano USB, controlador…) para Tidal Studio. Lo carga start_superdirt.scd después de ~dirt.start.
//
// - Escucha los teclados MIDI conectados (CoreMIDI en Mac, Windows MIDI, ALSA en Linux). Un piano USB
//   "class compliant" (USB-B → USB-C) aparece solo, sin drivers.
// - Toca cada nota al momento con el sonido elegido en la web (superpiano, un instrumento de la biblioteca…)
//   por SuperDirt, en la orbit 11 (la de d12), para que suene con la latencia más baja posible.
// - Avisa al servidor de Tidal Studio de cada nota (OSC /ts/midi al puerto 57140): con eso la web
//   ilumina el teclado, graba la frase y la traduce a código de Tidal.
// Órdenes (OSC /tidalstudio, desde start_superdirt.scd): midiscan, midiset clave valor, midinote nota vel.
(
var dirt = ~dirt;
var to = NetAddr("127.0.0.1", 57140);
var conf = (sound: \superpiano, orbit: 11, play: true, chan: -1, device: "", length: 1.2, transpose: 0, volume: 1.0);
var ready = false;
var srcName = { |uid|
    var d = MIDIClient.sources.detect { |s| s.uid == uid };
    if(d.notNil) { d.device ++ " · " ++ d.name } { "?" }
};
var accept = { |chan, uid|
    (conf[\chan] < 0 or: { conf[\chan] == chan })
    and: { conf[\device] == "" or: { srcName.(uid) == conf[\device] } }
};
~studioMidiPlay = { |note, vel|
    var snd = conf[\sound].asSymbol, ev;
    if(conf[\play] and: { vel > 0 }) {
        ev = (type: \dirt, dirt: dirt, orbit: conf[\orbit], s: snd,
            note: note - 60 + conf[\transpose], amp: (vel / 127 * 0.55 + 0.05) * conf[\volume],
            cps: 1, delta: conf[\length], latency: 0.03);
        // Los sintes ("super…", ts_…) necesitan saber cuánto dura la nota; las grabaciones suenan enteras
        if(dirt.soundLibrary.buffers[snd].isNil) { ev[\sustain] = conf[\length] };
        // (type: \dirt) es el evento de SuperDirt; si esta versión no lo tiene, se lo damos a la orbit directamente
        try { ev.play } {
            try { dirt.orbits.wrapAt(conf[\orbit]).value(ev) } { |err| ("MIDI: no puedo tocar " ++ snd ++ ": " ++ err.errorString).postln };
        };
    };
};
~studioMidiScan = {
    var names;
    try {
        // Al volver a buscar (has enchufado el piano después) se desconecta todo y se conecta otra vez
        if(ready.not) { MIDIClient.init(verbose: false); ready = true } { try { MIDIIn.disconnectAll }; MIDIClient.list };
        MIDIIn.connectAll;
        names = MIDIClient.sources.collect { |s| s.device ++ " · " ++ s.name };
        // Avisamos a la web de los teclados que hay (puede no haber ninguno)
        to.sendMsg(*(["/ts/mididevs"] ++ names));
        ("TIDAL_STUDIO_MIDI: " ++ names.size ++ " entradas MIDI: " ++ names.join(", ")).postln;
    } { |err|
        to.sendMsg("/ts/midierr", err.errorString);
        ("MIDI no disponible: " ++ err.errorString).postln;
    };
};
~studioMidiSet = { |key, value|
    key = key.asSymbol;
    value = value.asString;
    switch(key,
        \sound, { conf[\sound] = value.asSymbol },
        \device, { conf[\device] = value },
        \play, { conf[\play] = value == "1" },
        \chan, { conf[\chan] = value.asInteger },
        \length, { conf[\length] = value.asFloat.clip(0.05, 8) },
        \transpose, { conf[\transpose] = value.asInteger.clip(-36, 36) },
        \volume, { conf[\volume] = value.asFloat.clip(0, 2) }
    );
};
MIDIdef.noteOn(\tsMidiOn, { |vel, note, chan, uid|
    if(accept.(chan, uid)) {
        // Muchos teclados mandan "note on" con velocidad 0 para soltar la tecla
        if(vel > 0) { ~studioMidiPlay.(note, vel); to.sendMsg("/ts/midi", "on", note, vel, chan, srcName.(uid)) }
        { to.sendMsg("/ts/midi", "off", note, 0, chan, srcName.(uid)) };
    };
});
MIDIdef.noteOff(\tsMidiOff, { |vel, note, chan, uid|
    if(accept.(chan, uid)) { to.sendMsg("/ts/midi", "off", note, vel, chan, srcName.(uid)) };
});
// Pedal de sustain (CC 64): la web alarga las notas mientras está pisado
MIDIdef.cc(\tsMidiPedal, { |val, num, chan, uid|
    if(accept.(chan, uid)) { to.sendMsg("/ts/midi", "pedal", num, val, chan, srcName.(uid)) };
}, 64);
~studioMidiScan.value;
"Tidal Studio: teclado MIDI listo.".postln;
)
