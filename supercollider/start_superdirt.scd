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
            // SuperDirt solo lee wav/aif por defecto; Freesound baja .ogg y muchos packs traen .mp3/.flac
            ~dirt.fileExtensions = (~dirt.fileExtensions ++ #["ogg", "oga", "flac", "mp3"]).asSet.asArray;
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
            // Biblioteca de sintetizadores propios (ts_rhodes, ts_pad, ts_acid…): ver studio-synthlib.scd
            (~studioDir +/+ "studio-synthlib.scd").load;
            s.sync;
            ~dirt.start(57120, 0 ! 12);   // 12 "orbits": una por pista d1..d12
            // Instrumentos de la biblioteca (una grabación por nota): ver studio-instruments.scd
            (~studioDir +/+ "studio-instruments.scd").load;
            // Motores de synth opcionales (Mi-UGens, VSTPlugin con Surge XT / Vital): ver studio-engines.scd
            (~studioDir +/+ "studio-engines.scd").load;
            // Lista de sonidos disponibles: la web marca en rojo los que falten en tu código
            ~studioListSounds = {
                var names = ~dirt.soundLibrary.buffers.keys ++ ~dirt.soundLibrary.synthEvents.keys ++ SynthDescLib.global.synthDescs.keys;
                ("TIDAL_STUDIO_SOUNDS: " ++ names.asArray.collect(_.asString).sort.join(" ")).postln;
            };
            ~studioListSounds.value;
            // Órdenes del servidor de Tidal Studio por OSC (solo desde este ordenador):
            // recargar un sonido recién instalado, quitarlo, grabar y volver a listar los sonidos.
            OSCdef(\tidalStudio, { |msg, time, addr|
                var cmd = msg[1].asString;
                if(addr.ip == "127.0.0.1") {
                    fork {
                        switch(cmd,
                            "reload", {
                                ~dirt.freeSoundFiles([msg[2].asSymbol]);
                                ~studioMultiForget.(msg[2]);
                                ~dirt.loadSoundFiles(msg[3].asString);
                                s.sync;
                                ("Sample recargado: " ++ msg[2]).postln;
                                ~studioListSounds.value;
                            },
                            "free", { ~dirt.freeSoundFiles([msg[2].asSymbol]); ~studioMultiForget.(msg[2]); ~studioListSounds.value },
                            "record", { s.record(msg[2].asString); ("Grabando en " ++ msg[2]).postln },
                            "stoprecord", { s.stopRecording; "Grabación terminada".postln },
                            "list", { ~studioListSounds.value },
                            // Instrumentos VST (Surge XT, Vital…): ver studio-engines.scd
                            "vstadd", { ~studioVstAdd.(msg[2], msg[3].asString, msg[4].asString); 2.wait; ~studioListSounds.value },
                            "vsteditor", { ~studioVstEditor.(msg[2]) },
                            "vstsave", { ~studioVstSave.(msg[2], msg[3].asString) }
                        );
                    };
                };
            }, '/tidalstudio');
            // Cada nota que suena se avisa a la web (pista, momento del ciclo, sonido) para iluminar
            // en el código el trozo que está sonando. Va al servidor de Tidal Studio por OSC (puerto 57140).
            ~dirt.receiveAction = { |to|
                { |e|
                    try {
                        to.sendMsg("/ts/ev", (e[\orbit] ? 0).asInteger, (e[\cycle] ? -1).asFloat, (e[\delta] ? 0).asFloat,
                            (e[\latency] ? 0).asFloat, (e[\s] ? "").asString, (e[\n] ? e[\note] ? 0).asFloat, (e[\cps] ? 0).asFloat);
                    };
                }
            }.value(NetAddr("127.0.0.1", 57140));
            "SuperDirt listo para Tidal Studio".postln;
        };
        s.latency = 0.3;
    };
};
)
