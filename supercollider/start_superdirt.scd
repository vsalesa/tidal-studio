// Arranca el servidor de audio y SuperDirt para Tidal Studio.
// Lo ejecuta automáticamente el servidor (sclang start_superdirt.scd).
(
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
            s.sync;
            ~dirt.start(57120, 0 ! 12);   // 12 "orbits": una por pista d1..d12
            "SuperDirt listo para Tidal Studio".postln;
        };
        s.latency = 0.3;
    };
};
)
