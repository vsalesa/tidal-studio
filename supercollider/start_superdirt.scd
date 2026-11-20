// Arranca el servidor de audio y SuperDirt para Tidal Studio.
// Lo ejecuta automáticamente el servidor (sclang start_superdirt.scd).
(
// La ruta hay que guardarla ahora: dentro de waitForBoot ya no está disponible
~studioDir = PathName(thisProcess.nowExecutingPath).pathOnly;
if(\SuperDirt.asClass.isNil) {
    "ERROR: SuperDirt no está instalado. Ejecuta el instalador de Tidal Studio.".postln;
} {
    s.reboot {
        s.options.numBuffers = 1024 * 256;
        s.options.memSize = 8192 * 32;
        s.options.numWireBufs = 2048;
        s.options.maxNodes = 1024 * 32;
        s.options.numOutputBusChannels = 2;
        s.options.numInputBusChannels = 2;
        s.waitForBoot {
            ~dirt.free;
            ~dirt = SuperDirt(2, s);
            ~dirt.loadSoundFiles;
            // Tu biblioteca de Tidal Studio: cada carpeta de samples/ es un sonido
            ~studioSamples = ~studioDir +/+ ".." +/+ "samples";
            if(File.exists(~studioSamples)) { ~dirt.loadSoundFiles(~studioSamples +/+ "*") };
            // Pack opcional de cajas de ritmos (git clone en samples/packs/tidal-drum-machines)
            if(File.exists(~studioSamples +/+ "packs/tidal-drum-machines/machines")) {
                ~dirt.loadSoundFiles(~studioSamples +/+ "packs/tidal-drum-machines/machines/*/*")
            };
            s.sync;
            // Piano sin plugins, el resto de sintes "super…" y la trompeta (ver studio-synths.scd)
            (~studioDir +/+ "studio-synths.scd").load;
            s.sync;
            ~dirt.start(57120, 0 ! 12);   // 12 "orbits": una por pista d1..d12
            // Lista de sonidos disponibles: la web marca en rojo los que falten en tu código
            ~studioListSounds = {
                var names = ~dirt.soundLibrary.buffers.keys ++ ~dirt.soundLibrary.synthEvents.keys ++ SynthDescLib.global.synthDescs.keys;
                ("TIDAL_STUDIO_SOUNDS: " ++ names.asArray.collect(_.asString).sort.join(" ")).postln;
            };
            ~studioListSounds.value;
            "SuperDirt listo para Tidal Studio".postln;
        };
        s.latency = 0.3;
    };
};
)
