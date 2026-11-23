// Motores de synth opcionales. Lo carga start_superdirt.scd después de arrancar ~dirt.
// Cada parte solo se activa si su plugin está instalado (Ajustes → Instrumentos → Motores de synth):
//
//  1) Mi-UGens (Mutable Instruments): \plaits, \braids y \rings como sintetizadores de SuperDirt.
//        d1 $ n "c e g" # s "plaits" # engine 5 # timbre 0.3 # harm 0.5 # morph 0.6
//  2) VSTPlugin: synths VST3 como Surge XT y Vital. Cada «instrumento VST» es una copia del plugin con
//     su sonido; las notas de Tidal le llegan como MIDI.
//        d1 $ n "c'maj" # s "surge"            (o s "surge_<sonido>" para un sonido de fábrica)
//     La lista de instrumentos VST está en samples/vst-instruments.json (la escribe Tidal Studio).
(
// Cada motor va en su propio archivo: SuperCollider no puede ni leer código que nombra un plugin
// que no está instalado, así que solo cargamos los que existen.
if(\MiPlaits.asClass.notNil) { (~studioDir +/+ "studio-engine-mi.scd").load } {
    "Tidal Studio: Mi-UGens no está instalado (plaits, braids y rings no sonarán).".postln };
if(\VSTPlugin.asClass.notNil) { (~studioDir +/+ "studio-engine-vst.scd").load } {
    "Tidal Studio: VSTPlugin no está instalado (Surge XT y Vital no sonarán).".postln };
)
