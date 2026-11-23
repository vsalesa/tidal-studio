// Instrumentos VST (Surge XT, Vital…) con VSTPlugin. Lo carga studio-engines.scd solo si VSTPlugin
// está instalado. La lista de instrumentos activados está en samples/vst-instruments.json.
(
var dirt = ~dirt;
var vstFile = ~studioDir +/+ ".." +/+ "samples" +/+ "vst-instruments.json";
// ------------------------------------------------------------ 2) VSTPlugin: Surge XT, Vital…
var server = Server.default;
var ctrls = IdentityDictionary.new;
// Un synth por instrumento VST, que suena directo a la salida principal (estéreo)
SynthDef(\ts_vsti, { |out=0, amp=0.8| Out.ar(out, VSTPlugin.ar(nil, 2, id: \vsti) * amp) }).add;
server.sync;
~studioVstAdd = { |name, plugin, program|
    fork {
        var syn, ctl, ok = Condition(false), opened = false;
        name = name.asSymbol;
        if(ctrls[name].notNil) { ctrls[name].synth.free };
        syn = Synth(\ts_vsti, [\out, 0], server, \addToTail);
        server.sync;
        ctl = VSTPluginController(syn, \vsti);
        ctl.open(plugin, action: { |c, success|
            opened = success;
            if(success.not) { ("VST: no pude abrir " ++ plugin ++ " (¿está instalado?)").postln };
            ok.test = true; ok.signal;
        });
        ok.wait;
        if(opened.not) { syn.free; nil.alwaysYield };
        if(program.notNil and: { program.asString.size > 0 } and: { File.exists(program.asString) }) {
            ctl.readProgram(program.asString);
        };
        ctrls[name] = ctl;
        // Las notas de Tidal llegan como MIDI, con el mismo retraso que el resto del sonido
        dirt.soundLibrary.addSynth(name, (play: {
            var c = ctrls[~s], note = ~midinote.value.round.asInteger.clip(0, 127);
            var vel = ((~velocity ? 1) * (~amp ? 0.4) / 0.4 * 100).clip(1, 127).asInteger;
            var len = ~sustain.value ? 0.5;
            if(c.notNil) {
                server.makeBundle(~latency, { c.midi.noteOn(0, note, vel) });
                server.makeBundle(~latency + len, { c.midi.noteOff(0, note, 0) });
            };
            true
        }));
        ("VST listo: " ++ name).postln;
    };
};
~studioVstEditor = { |name| var c = ctrls[name.asSymbol]; if(c.notNil) { c.editor } };
~studioVstSave = { |name, path| var c = ctrls[name.asSymbol]; if(c.notNil) { c.writeProgram(path) } };
// Los instrumentos VST que ya tenías activados
if(File.exists(vstFile)) {
    var list = try { File.readAllString(vstFile).parseJSON } { nil };
    if(list.notNil) {
        list.do { |v| ~studioVstAdd.(v["name"], v["plugin"], v["program"]) };
    };
};
"Tidal Studio: VSTPlugin listo.".postln;
)
