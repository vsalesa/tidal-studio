// Teclado MIDI (piano USB, controlador…) para Tidal Studio. Lo carga start_superdirt.scd después de ~dirt.start.
//
// - Escucha los teclados MIDI conectados (CoreMIDI en Mac, Windows MIDI, ALSA en Linux). Un piano USB
//   "class compliant" (USB-B → USB-C) aparece solo, sin drivers.
// - Toca cada nota al momento con el sonido elegido en la web (superpiano, un instrumento de la biblioteca…)
//   por SuperDirt, en su propia orbit (la 13.ª, índice 12), para que suene con la latencia más baja posible
//   sin tocar los efectos de d12.
// - Avisa al servidor de Tidal Studio de cada nota (OSC /ts/midi al puerto 57140): con eso la web
//   ilumina el teclado, graba la frase y la traduce a código de Tidal.
// - Vigila cada 2 s si enchufas o desenchufas un teclado: se conecta solo y, al quitarlo, se sueltan sus notas.
// Órdenes (OSC /tidalstudio, desde start_superdirt.scd): midiscan, midiset clave valor, midinote nota vel, midicut.
(
var dirt = ~dirt;
var to = NetAddr("127.0.0.1", 57140);
var conf = (sound: \superpiano, orbit: 12, play: true, chan: -1, device: "", length: 1.2, transpose: 0, volume: 1.0);
var ready = false;
var currentNames = { MIDIClient.sources.collect { |d| d.device ++ " · " ++ d.name } };
var knownOuts = [];   // salidas MIDI la última vez que miramos
var known = [];   // teclados conectados la última vez que miramos (nombre «aparato · puerto»)
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
// Corta lo que esté sonando del teclado (al desactivar «Que suene», cambiar de teclado o desenchufarlo)
~studioMidiCut = {
    var orbit = try { dirt.orbits[conf[\orbit]] } { nil };
    if(orbit.notNil) {
        try { if(orbit.respondsTo(\freeSynths)) { orbit.freeSynths } { s.sendMsg("/n_set", orbit.group, \gate, 0) } };
    };
};
// Nombres de los teclados que ve el sistema ahora mismo
// Mira qué teclados hay y, si ha cambiado algo, reconecta y avisa: qué se ha enchufado y qué se ha quitado.
// full: true al pulsar «Buscar» (en Mac reinicia CoreMIDI para ver un piano enchufado tarde)
~studioMidiRefresh = { |full = false|
    var names, gone, added, outs;
    if(ready.not) { MIDIClient.init(verbose: false); ready = true } {
        if(full and: { thisProcess.platform.name == \osx } and: { MIDIClient.respondsTo(\restart) }) {
            MIDIClient.restart
        } { MIDIClient.list };
    };
    names = currentNames.value;
    outs = ~studioMidiOutNames.value;
    if(full or: { names != known } or: { outs != knownOuts }) {
        knownOuts = outs;
        gone = known.reject { |n| names.includesEqual(n) };
        added = names.reject { |n| known.includesEqual(n) };
        try { MIDIIn.disconnectAll };
        MIDIIn.connectAll;
        known = names;
        gone.do { |n| to.sendMsg("/ts/midiunplug", n) };
        added.do { |n| to.sendMsg("/ts/midiplug", n) };
        // Si el teclado elegido se ha ido, lo que estaba sonando se corta (si no, se quedaría colgado)
        if(gone.notEmpty) { ~studioMidiCut.value };
        to.sendMsg(*(["/ts/mididevs"] ++ names));
        to.sendMsg(*(["/ts/midiouts"] ++ ~studioMidiOutNames.value));
        // La salida elegida ha desaparecido (desenchufado): la soltamos; al volver, la web la vuelve a elegir
        if(~studioMidiOutName != "" and: { ~studioMidiOutNames.value.includesEqual(~studioMidiOutName).not }) {
            ~studioMidiOutName = ""; to.sendMsg("/ts/midiout", "");
        };
        ("TIDAL_STUDIO_MIDI: " ++ names.size ++ " entradas MIDI: " ++ names.join(", ")).postln;
    };
};
~studioMidiScan = {
    try { ~studioMidiRefresh.(true) } { |err|
        to.sendMsg("/ts/midierr", err.errorString);
        ("MIDI no disponible: " ++ err.errorString).postln;
    };
};
~studioMidiSet = { |key, value|
    key = key.asSymbol;
    value = value.asString;
    switch(key,
        \sound, { conf[\sound] = value.asSymbol },
        \device, { if(conf[\device] != value) { ~studioMidiCut.value }; conf[\device] = value },
        \play, { conf[\play] = value == "1"; if(conf[\play].not) { ~studioMidiCut.value } },
        \chan, { if(conf[\chan] != value.asInteger) { ~studioMidiCut.value }; conf[\chan] = value.asInteger },
        \length, { conf[\length] = value.asFloat.clip(0.05, 8) },
        \transpose, { conf[\transpose] = value.asInteger.clip(-36, 36) },
        \volume, { conf[\volume] = value.asFloat.clip(0, 2) }
    );
};
// ---------------------------------------------------------------- salida: de Tidal Studio al teclado
// Una sola MIDIOut a la que le cambiamos el destino. Se registra en SuperDirt como el sonido "midi":
//   d1 $ n "c e g" # s "midi" # midichan 0        (toca la pista con el sonido de tu teclado)
//   p "ts-midiclock" $ midicmd "midiClock*96" # s "midi"   (reloj: 24 pulsos por negra, 4 negras por ciclo)
// Órdenes: midiout nombre ("" = ninguna), midiprog canal programa, midicc canal control valor, midipanic.
~studioMidiOutName = "";
~studioMidiOutNames = { try { MIDIClient.destinations.collect { |d| d.device ++ " · " ++ d.name } } { [] } };
~studioMidiOutSet = { |name|
    var dests = MIDIClient.destinations, idx, d;
    name = name.asString;
    idx = dests.detectIndex { |x| (x.device ++ " · " ++ x.name) == name };
    if(~studioMidiOut.notNil and: { ~studioMidiOutName != "" }) { ~studioMidiPanic.value };
    if(idx.isNil) {
        ~studioMidiOutName = "";
        if(name != "") { to.sendMsg("/ts/midierr", "MIDI out: no encuentro " ++ name) };
    } {
        d = dests[idx];
        if(~studioMidiOut.isNil) {
            ~studioMidiOut = MIDIOut(0, d.uid);
            // El sonido "midi" de SuperDirt: las notas salen a tiempo con el audio
            dirt.soundLibrary.addMIDI(\midi, ~studioMidiOut);
        };
        if(thisProcess.platform.name == \linux) {
            try { ~studioMidiOut.disconnect(~studioMidiOutIdx ? 0) };
            ~studioMidiOut.connect(idx);
            ~studioMidiOutIdx = idx;
        } { ~studioMidiOut.uid = d.uid; ~studioMidiOut.port = idx };
        ~studioMidiOut.latency = s.latency ? 0.3;
        ~studioMidiOutName = name;
        ("TIDAL_STUDIO_MIDI: salida al teclado " ++ name).postln;
    };
    to.sendMsg("/ts/midiout", ~studioMidiOutName);
};
// Todas las notas fuera en los 16 canales (Silencio, cambiar de salida, desenchufar)
~studioMidiPanic = {
    if(~studioMidiOut.notNil and: { ~studioMidiOutName != "" }) {
        16.do { |ch| try { ~studioMidiOut.control(ch, 123, 0); ~studioMidiOut.control(ch, 64, 0) } };
    };
};
~studioMidiProg = { |chan, prog|
    if(~studioMidiOut.notNil and: { ~studioMidiOutName != "" }) { try { ~studioMidiOut.program(chan.clip(0, 15), prog.clip(0, 127)) } };
};
~studioMidiCC = { |chan, num, val|
    if(~studioMidiOut.notNil and: { ~studioMidiOutName != "" }) { try { ~studioMidiOut.control(chan.clip(0, 15), num.clip(0, 127), val.clip(0, 127)) } };
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
// Vigilante de enchufar y desenchufar: cada 2 s mira la lista (barato) y solo reconecta si ha cambiado
~studioMidiWatch.stop;
~studioMidiWatch = fork {
    var said = false;
    loop {
        2.wait;
        // Un error se cuenta una vez, no cada 2 s
        try { ~studioMidiRefresh.(false); said = false } { |err| if(said.not) { ("MIDI: " ++ err.errorString).postln; said = true } };
    };
};
"Tidal Studio: teclado MIDI listo.".postln;
)
