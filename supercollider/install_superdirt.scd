// Instala SuperDirt (los sonidos y sintetizadores que usa Tidal) y sale.
(
if(\SuperDirt.asClass.notNil) {
    "SuperDirt ya estaba instalado.".postln;
    0.exit;
} {
    "Instalando SuperDirt (puede tardar unos minutos: descarga ~200 MB de sonidos)…".postln;
    Quarks.install("SuperDirt");
    "SuperDirt instalado.".postln;
    0.exit;
};
)
