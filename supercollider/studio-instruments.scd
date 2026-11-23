// Instrumentos multimuestreados de la biblioteca de instrumentos de Tidal Studio.
// Lo carga start_superdirt.scd después de crear ~dirt.
//
// Un instrumento de la biblioteca es una carpeta de samples/ con una grabación por nota,
// y cada archivo se llama con su nota MIDI delante: m060_C4.mp3, m063_Eb4.mp3, m066_Gb4.mp3…
// Con eso se toca con notas, como un sintetizador:
//     d1 $ note "c e g" # s "harpsichord_fluid"      (o n "c e g": aquí n también es la nota)
// Para cada nota elegimos la grabación más cercana y la afinamos (como hace GarageBand o un sampler):
// ~n pasa a ser el número de grabación y ~note la diferencia que hay que subir o bajar.
// Si una carpeta no sigue ese formato, se toca como siempre (n = número de sample).
(
var dirt = ~dirt;
var cache = IdentityDictionary.new;   // nombre -> [nota de cada grabación] o false
var rootsFor = { |name|
    var r = cache[name];
    if(r.isNil) {
        var bufs = dirt.soundLibrary.buffers[name];
        r = false;
        if(bufs.notNil and: { bufs.size > 0 }) {
            var roots = bufs.collect { |b|
                var m = PathName(b.path ? "").fileName.findRegexp("^m([0-9]{3})_");
                if(m.notEmpty) { m[1][1].asInteger } { nil }
            };
            if(roots.every(_.notNil)) { r = roots };
        };
        cache[name] = r;
    };
    r
};
var divert = {
    var roots = rootsFor.(~s);
    if(roots.isArray) {
        var midi = (~note ? 0) + (if(~n.isNumber) { ~n } { 0 }) + ((~octave ? 5) * 12);
        var best = 0, dist = inf;
        roots.do { |r, i| var d = (midi - r).abs; if(d < dist) { dist = d; best = i } };
        ~n = best;
        ~note = midi - roots[best];
        ~octave = 5;
    };
    nil   // nil = SuperDirt sigue con el evento normal (ya con la grabación y la afinación elegidas)
};
dirt.orbits.do { |o| o.set(\diversion, divert) };
// Al recargar o quitar un sonido (orden "reload"/"free") hay que olvidar sus notas
~studioMultiForget = { |name| cache.removeAt(name.asSymbol) };
"Tidal Studio: instrumentos multimuestreados listos.".postln;
)
