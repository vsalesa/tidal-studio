"""Generar una canción a partir de TU MIDI, en el estilo que elijas.

Coge lo que quieras conservar de tu MIDI (melodía, acordes, bajo, batería, tempo) y escribe el resto como lo
haría ese estilo: la batería de los cursos de género, un bajo y un acompañamiento con los ritmos medidos en
canciones reales (ver server/data/style_profiles.json y docs/COURSES.md) tocados sobre TUS acordes, y una
melodía nueva hecha con frases de pregunta y respuesta si no te quedas la tuya.

Todo es local y determinista (la misma semilla da la misma versión), así que funciona sin IA. Después Maestro
puede variarla, alargarla o explicarla.
"""
import random
import re

from songimport import KEY_NAMES, NOTE_NAMES, _compress, analyse

ROLES = ("melody", "chords", "bass", "drums", "tempo")

# Intervalos de cada tipo de acorde (nombres de acorde de Tidal, los mismos que usa songimport.CHORDS)
QUALITY = {"major": (0, 4, 7), "minor": (0, 3, 7), "dom7": (0, 4, 7, 10), "min7": (0, 3, 7, 10),
           "major7": (0, 4, 7, 11), "dim": (0, 3, 6), "sus4": (0, 5, 7), "sus2": (0, 2, 7)}
SUFFIX = {"major": "", "minor": "m", "dom7": "7", "min7": "m7", "major7": "maj7", "dim": "dim", "sus4": "sus4", "sus2": "sus2"}
MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10)


def T(es, en):
    return {"es": es, "en": en}


# ---------------------------------------------------------------- estilos
# drums: pistas de percusión de los cursos (web/courses.js), tal cual.
# bass.pattern: un compás; R raíz, L quinta por debajo, F quinta, T tercera, O octava, S séptima,
#   N raíz del acorde siguiente, A nota de aproximación (un semitono por debajo del acorde siguiente), _ alarga.
# comp.pattern: x = el acorde entero, 0-3 = notas del acorde de grave a agudo (3 = la de abajo, una octava arriba).
# lead.rhythms: x = una nota de la melodía (A pregunta, B respuesta).
# center: la nota MIDI alrededor de la que se mueve cada parte.
STYLES = {
    "merengue": {
        "name": "Merengue", "bpm": 140, "mode": "major", "prog": ["I", "IV", "V7", "I"],
        "drums": [(T("Güira", "Güira"), 's "[guiro:3 ~ guiro:1 guiro:2]*4" # gain "[1.15 0 0.75 0.65]*4" # cut 1 # hpf 2500 # pan 0.65'),
                  (T("Tambora", "Tambora"), 's "[woodblock_vcsl:6 ~ woodblock_vcsl:6 woodblock_vcsl:7] [woodblock_vcsl:6 ~ congas:22 ~] [woodblock_vcsl:6 ~ woodblock_vcsl:6 woodblock_vcsl:7] [congas:6 ~ congas:22 congas:22]" # gain 0.9 # room 0.15'),
                  (T("Bombo", "Kick"), 's "bd*4" # gain "[0.9 0.7]*2" # lpf 2500')],
        "bass": {"name": T("Bajo eléctrico", "Electric bass"), "patterns": ["R ~ ~ ~ ~ ~ L ~ R ~ ~ ~ L ~ A ~", "R ~ ~ ~ ~ ~ L ~ R ~ ~ ~ T ~ A ~"],
                 "sound": "electric_bass_finger_fluid", "fx": "# legato 0.7 # gain 0.9", "center": 38,
                 "why": T("salta entre la raíz y la quinta en el 1, el «y» del 2, el 3 y el 4, y acaba con una nota que se acerca al acorde siguiente, como en los merengues reales que analizamos",
                          "jumps between root and fifth on 1, the «and» of 2, 3 and 4, and ends with a note that leads into the next chord, like the real merengues we analysed")},
        "comp": {"name": T("Piano", "Piano"), "patterns": ["[0 [1 2] 0 [1 2] 0 1 2 [3 2]]"], "sound": "bright_acoustic_piano_fluid",
                 "fx": '# legato 0.6 # gain "[0.9 0.75]*4" # room 0.2', "center": 61,
                 "why": T("parte cada acorde nota a nota en casi todas las corcheas, con dos semicorcheas al final del 2 y del 4",
                          "breaks each chord up note by note on almost every eighth, with two sixteenths at the end of beats 2 and 4")},
        "lead": {"name": T("Trompetas", "Trumpets"), "rhythms": ["x ~ x x ~ x x ~", "x x x x ~ x ~ x"], "sound": "trumpet_fluid",
                 "fx": "# legato 0.8 # gain 0.9 # room 0.25", "center": 76},
    },
    "salsa": {
        "name": "Salsa", "bpm": 180, "mode": "minor", "prog": ["i", "iv", "V7", "iv"],
        "drums": [(T("Clave 2-3", "2-3 clave"), 's "<[~ claves:1 claves:1 ~] [claves:1 ~ ~ claves:1 ~ ~ claves:1 ~]>" # gain 1'),
                  (T("Congas (tumbao)", "Congas (tumbao)"), 's "congas:0 congas:1 congas:12 congas:1 congas:0 congas:1 congas:6 congas:22" # gain "0.75 0.65 1 0.65 0.75 0.65 1 1" # pan 0.4'),
                  (T("Bongó (martillo)", "Bongo (martillo)"), 's "bongos:0 bongos:6 bongos:2 bongos:6 bongos:0 bongos:6 bongos:16 bongos:7" # gain "0.95 0.75 0.9 0.75 0.95 0.75 1 0.75" # pan 0.6'),
                  (T("Campana", "Bongo bell"), 's "[cowbells:11 cowbells:9]*4" # gain "[1 0.7]*4" # pan 0.6')],
        "bass": {"name": T("Contrabajo (tumbao)", "Upright bass (tumbao)"), "patterns": ["~ ~ ~ F ~ ~ N ~"], "sound": "acoustic_bass_fluid",
                 "fx": "# legato 3 # gain 0.95", "center": 37,
                 "why": T("es el tumbao: nunca toca en el 1; da la quinta en el «y» del 2 y ya en el 4 se adelanta a la raíz del acorde siguiente",
                          "is the tumbao: it never plays on 1; it gives the fifth on the «and» of 2 and on 4 it already anticipates the next chord's root")},
        "comp": {"name": T("Piano (guajeo)", "Piano (guajeo)"), "patterns": ["[~ 1 0 ~ 2 1 ~ 3]"], "sound": "bright_acoustic_piano_fluid",
                 "fx": "# legato 0.9 # gain 0.85", "center": 72, "wrap": "superimpose (|- note 12) $ ",
                 "why": T("es un guajeo: notas del acorde a contratiempo, doblado una octava abajo (superimpose)",
                          "is a guajeo: chord notes on the off-beats, doubled an octave below (superimpose)")},
        "lead": {"name": T("Flauta", "Flute"), "rhythms": ["~ x x ~ x x ~ x", "x ~ x x ~ ~ x ~"], "sound": "flute_fluid",
                 "fx": "# legato 0.8 # gain 0.85 # room 0.25", "center": 79},
    },
    "cumbia": {
        "name": "Cumbia", "bpm": 96, "mode": "minor", "prog": ["i", "iv", "V7", "i"],
        "drums": [(T("Güiro", "Güiro"), 's "[guiro:3 ~ guiro:1 guiro:2]*4" # gain "[1.15 0 0.75 0.65]*4" # cut 1 # hpf 2000 # pan 0.4'),
                  (T("Congas", "Congas"), 's "[congas:1 congas:6] [congas:1 congas:22] [congas:1 congas:6] [congas:1 [congas:22 congas:23]]" # gain "[0.7 1]*4" # pan 0.6'),
                  (T("Bombo y timbal", "Kick and timbal"), 's "[bd ~ ~ ~ bd ~ bd ~, ~ ~ concert_tom_hi:2 ~ ~ ~ concert_tom_hi:2 ~]" # gain 0.95')],
        "bass": {"name": T("Bajo eléctrico", "Electric bass"), "patterns": ["R ~ ~ ~ F ~ F ~", "R ~ ~ ~ F ~ T A"], "sound": "electric_bass_finger_fluid",
                 "fx": "# legato 0.8 # gain 0.9", "center": 37,
                 "why": T("toca la raíz en el 1 y la quinta dos veces en el 3: el «tum… ta-ta» de la cumbia",
                          "plays the root on 1 and the fifth twice on 3: cumbia's «boom… ta-ta»")},
        "comp": {"name": T("Órgano", "Organ"), "patterns": ["[~ x]*4"], "sound": "drawbar_organ_fluid", "fx": "# legato 0.45 # gain 0.85", "center": 57,
                 "why": T("toca el acorde entero a contratiempo, en cada «y»", "plays the whole chord on the off-beat, on every «and»")},
        "lead": {"name": T("Acordeón", "Accordion"), "rhythms": ["x ~ x x ~ x x ~", "x x x x ~ x x x"], "sound": "accordion_fluid",
                 "fx": "# legato 0.85 # gain 0.85 # room 0.25", "center": 76},
    },
    "reggaeton": {
        "name": "Reggaeton", "bpm": 92, "mode": "minor", "prog": ["i", "VI", "III", "VII"],
        "drums": [(T("Bombo 808", "808 kick"), 's "808bd:3*4" # gain 1'),
                  (T("Caja dembow", "Dembow snare"), 's "[~ ~ ~ sn] [~ ~ sn ~] [~ ~ ~ sn] <[~ ~ sn ~] [~ ~ sn ~] [~ ~ sn ~] [sn sn sn sn]>" # gain 0.9 # nudge (-0.015)'),
                  (T("Hi-hats", "Hi-hats"), 's "hh*8" # gain "[0.55 0.8]*4" # pan 0.6')],
        "bass": {"name": T("Sub 808", "808 sub"), "patterns": ["R ~ ~ R ~ ~ R ~"], "sound": "ts_sub", "fx": "# legato 0.6 # gain 0.95", "center": 35,
                 "why": T("sigue el «tresillo» 3-3-2 del dembow con la raíz de cada acorde", "follows the dembow's 3-3-2 «tresillo» with each chord's root")},
        "comp": {"name": T("Pad", "Pad"), "patterns": ["x"], "sound": "pad_2_warm_fluid", "fx": "# legato 1 # gain 0.8 # lpf 2500 # room 0.3", "center": 61,
                 "why": T("deja cada acorde sonando el compás entero, como una alfombra", "lets each chord ring for the whole bar, like a carpet")},
        "lead": {"name": T("Guitarra (gancho)", "Guitar (hook)"), "rhythms": ["x ~ ~ x ~ ~ x ~", "x ~ ~ x ~ ~ x x"], "sound": "acoustic_guitar_nylon_fluid",
                 "fx": "# gain 0.9 # delay 0.3 # delaytime (60/92/2) # delayfeedback 0.35", "center": 74},
    },
    "bossa": {
        "name": "Bossa nova", "bpm": 130, "mode": "major", "prog": ["Imaj7", "vi7", "ii7", "V7"], "sevenths": True,
        "drums": [(T("Shaker", "Shaker"), 's "[shaker_small:0 shaker_small:2]*8" # gain "[0.95 0.7 0.85 0.7]*4" # hpf 3000 # pan 0.6'),
                  (T("Surdo", "Surdo"), 's "bd ~ ~ bd bd ~ ~ bd" # gain 0.8 # lpf 900'),
                  (T("Aro", "Rimshot"), 's "<[808:5 ~ ~ 808:5 ~ ~ 808:5 ~] [~ ~ 808:5 ~ ~ 808:5 ~ ~]>" # gain 0.75')],
        "bass": {"name": T("Contrabajo", "Upright bass"), "patterns": ["R ~ ~ L L ~ ~ R"], "sound": "acoustic_bass_fluid", "fx": "# legato 1 # gain 0.9", "center": 36,
                 "why": T("alterna la raíz y la quinta de abajo: «pum… pum-pum… pum»", "alternates the root and the fifth below: «boom… boom-boom… boom»")},
        "comp": {"name": T("Guitarra de nailon", "Nylon guitar"), "patterns": ["x ~ ~ x ~ ~ x ~", "~ ~ x ~ ~ x ~ x"], "sound": "acoustic_guitar_nylon_fluid",
                 "fx": "# legato 0.5 # gain 0.85 # room 0.15", "center": 55,
                 "why": T("rasguea acordes de séptima con síncopa, como João Gilberto", "strums seventh chords with syncopation, like João Gilberto")},
        "lead": {"name": T("Flauta", "Flute"), "rhythms": ["x ~ ~ x x ~ ~ x", "~ ~ ~ ~ x ~ ~ ~"], "sound": "flute_fluid", "fx": "# legato 0.95 # gain 0.85 # room 0.3", "center": 80},
    },
    "jazz": {
        "name": "Jazz", "bpm": 140, "mode": "major", "prog": ["ii7", "V7", "Imaj7", "VI7"], "sevenths": True,
        "drums": [(T("Ride", "Ride"), 's "[drumtraks:7 ~ ~] [drumtraks:7 ~ drumtraks:7] [drumtraks:7 ~ ~] [drumtraks:7 ~ drumtraks:7]" # gain 0.8 # pan 0.65'),
                  (T("Charles y bombo", "Hi-hat and kick"), 's "[jazz:0, ~ jazz:3]*2" # gain 0.65')],
        "bass": {"name": T("Bajo caminante", "Walking bass"), "patterns": ["R T F A", "R F T A"], "sound": "superpwm", "fx": "# lpf 700 # legato 0.9 # gain 0.95", "center": 41,
                 "why": T("camina: una nota por tiempo por las notas del acorde y la última se acerca al acorde siguiente", "walks: one note per beat through the chord, and the last one leads into the next chord")},
        "comp": {"name": T("Piano", "Piano"), "patterns": ["[x ~ ~] [~ ~ x] ~ ~", "~ [~ ~ x] ~ [x ~ ~]"], "sound": "superpiano", "fx": "# gain 0.65 # legato 0.6 # room 0.25", "center": 64,
                 "why": T("«comping»: acordes de séptima en golpes cortos y a destiempo, dejando aire", "«comping»: short, off-beat seventh chords that leave space")},
        "lead": {"name": T("Trompeta", "Trumpet"), "rhythms": ["[x ~ x] [x ~ x] [x ~ ~] [~ ~ x]", "[x ~ x] [x ~ ~] [x ~ x] [x ~ ~]"], "sound": "supertrumpet",
                 "fx": "# lpf 2200 # legato 0.9 # gain 0.7 # room 0.2", "center": 76},
    },
    "funk": {
        "name": "Funk", "bpm": 104, "mode": "minor", "prog": ["i7", "IV7", "i7", "IV7"], "sevenths": True,
        "drums": [(T("Bombo", "Kick"), 's "bd ~ ~ bd ~ ~ ~ ~ ~ ~ bd ~ ~ bd ~ ~" # gain 1'),
                  (T("Caja", "Snare"), 's "~ ~ ~ ~ sn ~ ~ sn ~ sn ~ ~ sn ~ ~ sn" # gain "0 0 0 0 1 0 0 0.35 0 0.35 0 0 1 0 0 0.4"'),
                  (T("Hi-hats", "Hi-hats"), 's "hh*16" # gain "[0.9 0.5 0.7 0.5]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R ~ O ~ ~ R ~ S ~ R ~ T ~ ~ F ~"], "sound": "superpwm", "fx": "# lpf 1500 # legato 0.5 # gain 0.95", "center": 43,
                 "why": T("salta de octava y rellena las semicorcheas: el bajo funk es casi otra batería", "jumps octaves and fills the sixteenths: funk bass is almost another drummer")},
        "comp": {"name": T("Guitarra", "Guitar"), "patterns": ["~ x ~ x ~ ~ x ~ ~ x ~ x ~ ~ x ~"], "sound": "superpiano", "fx": "# legato 0.3 # hpf 500 # gain 0.65 # pan 0.35", "center": 64,
                 "why": T("da golpes cortos de acorde en las semicorcheas débiles, como una guitarra rítmica", "plays short chord stabs on the weak sixteenths, like a rhythm guitar")},
        "lead": {"name": T("Metales", "Horns"), "rhythms": ["~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~", "~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~ ~ ~ x ~"], "sound": "supertrumpet", "fx": "# legato 0.5 # gain 0.7", "center": 79},
    },
    "house": {
        "name": "House", "bpm": 124, "mode": "minor", "prog": ["i7", "VImaj7", "iv7", "v7"], "sevenths": True,
        "drums": [(T("Bombo", "Kick"), 's "house*4" # gain 1'), (T("Palmas", "Claps"), 's "~ cp ~ cp" # gain 0.85 # room 0.15'),
                  (T("Hi-hats", "Hi-hats"), 's "[house:3 house:3 house:4 house:3]*4" # gain "[0.6 0.5 0.85 0.5]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["[~ R]*4", "[~ R]*3 [~ O]"], "sound": "superpwm", "fx": "# lpf 700 # legato 0.6 # gain 0.95", "center": 37,
                 "why": T("toca a contratiempo, entre bombo y bombo: el «bombeo» del house", "plays on the off-beats, between the kicks: house's «pumping»")},
        "comp": {"name": T("Piano", "Piano"), "patterns": ["~ ~ x ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~"], "sound": "superpiano", "fx": "# legato 0.5 # gain 0.7 # room 0.3", "center": 66,
                 "why": T("da acordes sincopados de séptima, el piano típico del house de Chicago", "plays syncopated seventh chords, the classic Chicago house piano")},
        "lead": {"name": T("Sinte", "Synth"), "rhythms": ["x ~ x ~ x x ~ x", "x ~ ~ x ~ x ~ ~"], "sound": "supersaw",
                 "fx": "# lpf (range 800 4000 $ slow 8 sine) # legato 0.5 # gain 0.5 # delay 0.25 # delaytime (60/124*0.75) # delayfeedback 0.3", "center": 70},
    },
    "techno": {
        "name": "Techno", "bpm": 130, "mode": "minor", "prog": ["i", "i", "i", "III"],
        "drums": [(T("Bombo", "Kick"), 's "techno*4" # gain 1.05'), (T("Platos", "Hats"), 's "[hh27 hh27 ho hh27]*4" # cut 1 # gain "[0.6 0.5 0.8 0.5]*4"'),
                  (T("Palmas", "Claps"), 's "~ cp ~ cp" # gain 0.8 # room 0.25')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["[~ R R R]*4"], "sound": "superpwm", "fx": "# lpf 400 # legato 0.7 # shape 0.3 # gain 0.95", "center": 35,
                 "why": T("repite la raíz en las tres semicorcheas entre bombos: hipnótico", "repeats the root on the three sixteenths between kicks: hypnotic")},
        "comp": {"name": T("Pad", "Pad"), "kind": "textura", "patterns": ["x"], "sound": "supersaw", "fx": "# legato 1 # hpf 400 # lpf 2500 # room 0.6 # size 0.9 # gain 0.4", "center": 66,
                 "why": T("es un fondo largo y filtrado; en el techno manda el ritmo", "is a long filtered background; in techno the rhythm rules")},
        "lead": {"name": T("Línea ácida", "Acid line"), "rhythms": ["x x x x ~ x x x x ~ x x x ~ x x", "x x ~ x x ~ x x x x ~ x ~ x x ~"], "sound": "sawtooth",
                 "fx": "# lpf (range 300 3000 $ slow 16 sine) # resonance 0.25 # legato 0.6 # gain 0.55", "center": 50},
    },
    "dnb": {
        "name": "Drum & bass", "bpm": 174, "mode": "minor", "prog": ["i", "VI", "III", "VII"],
        "drums": [(T("Bombo", "Kick"), 's "bd ~ ~ ~ ~ ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~" # gain 1'), (T("Caja", "Snare"), 's "~ sn ~ sn" # gain 1 # shape 0.2'),
                  (T("Hi-hats", "Hi-hats"), 's "hh*8" # gain "[0.7 0.5]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R _ _ _ _ _ T _"], "sound": "supersaw", "fx": "# lpf 500 # legato 1 # gain 0.8", "center": 36,
                 "why": T("notas largas y graves que se arrastran debajo del ritmo rápido", "long, deep notes dragging under the fast beat")},
        "comp": {"name": T("Pad", "Pad"), "patterns": ["x"], "sound": "supersaw", "fx": "# lpf 1800 # legato 1 # gain 0.4 # room 0.6 # size 0.9", "center": 64,
                 "why": T("un acorde por compás, lejano y con mucha reverb", "one chord per bar, distant and with lots of reverb")},
        "lead": {"name": T("Piano", "Piano"), "rhythms": ["x ~ ~ x ~ ~ x ~", "~ ~ ~ ~ x ~ x x"], "sound": "superpiano",
                 "fx": "# gain 0.6 # room 0.4 # delay 0.35 # delaytime (60/174*0.75) # delayfeedback 0.4", "center": 78},
    },
    "lofi": {
        "name": "Lo-fi hip hop", "bpm": 80, "mode": "major", "prog": ["IVmaj7", "iii7", "ii7", "Imaj7"], "sevenths": True, "wrap": "swingBy (1/6) 4 $ ",
        "drums": [(T("Batería", "Drums"), 'swingBy (1/6) 4 $ s "[jazz:0 ~ ~ ~] [jazz:7 ~ ~ jazz:0] [~ ~ jazz:0 ~] [jazz:7 ~ ~ ~]" # lpf 3500'),
                  (T("Hi-hats", "Hi-hats"), 'swingBy (1/6) 4 $ s "jazz:3*8" # gain "[0.7 0.45]*4" # lpf 6000')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R _ _ _ _ _ F _"], "sound": "superpwm", "fx": "# lpf 350 # legato 1 # gain 0.95", "center": 40,
                 "why": T("una nota larga y una quinta corta al final, cálido y sin prisa", "one long note and a short fifth at the end, warm and unhurried")},
        "comp": {"name": T("Teclado", "Keys"), "patterns": ["x"], "sound": "superpiano", "fx": "# legato 1 # gain 0.6 # lpf 2500 # room 0.35", "center": 64,
                 "why": T("acordes de séptima largos y apagados (lpf), como un piano viejo", "long, muffled seventh chords (lpf), like an old piano")},
        "lead": {"name": T("Melodía", "Melody"), "rhythms": ["x ~ x ~ x ~ ~ ~", "x ~ ~ x ~ ~ x ~"], "sound": "superpiano",
                 "fx": "# gain 0.5 # lpf 3000 # room 0.4 # delay 0.3 # delaytime (60/80*0.75) # delayfeedback 0.3", "center": 79},
    },    # 0.17: géneros nuevos (los mismos ritmos que sus cursos en web/courses.js)
    "reggae": {
        "name": "Reggae", "bpm": 152, "mode": "minor", "prog": ["i", "VII", "i", "VII"],
        "drums": [(T("One drop", "One drop"), 's "~ ~ [bd,rm] ~" # gain 1.05'),
                  (T("Platos", "Hi-hats"), 'swingBy (1/8) 4 $ s "hh*8" # gain "[0.85 0.55]*4" # pan 0.6 # hpf 3000')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["~ R ~ ~ F ~ R T", "~ R ~ ~ F ~ O F"], "sound": "electric_bass_finger_fluid",
                 "fx": "# lpf 700 # legato 0.9 # gain 1", "center": 33,
                 "why": T("deja vacío el 1, como el one drop, y dibuja la raíz y la quinta con huecos", "leaves beat 1 empty, like the one drop, and draws root and fifth with gaps")},
        "comp": {"name": T("Guitarra skank", "Skank guitar"), "patterns": ["[~ x ~ x]"], "sound": "electric_guitar_muted_fluid",
                 "fx": "# legato 0.25 # gain 0.9 # hpf 400", "center": 57,
                 "why": T("acordes muy cortos en los tiempos 2 y 4: el skank", "very short chords on beats 2 and 4: the skank")},
        "lead": {"name": T("Melódica", "Melodica"), "rhythms": ["x ~ x ~ x ~ ~ x", "~ ~ x ~ x ~ ~ ~"], "sound": "accordion_fluid",
                 "fx": "# legato 0.8 # gain 0.75 # room 0.3", "center": 76},
    },
    "boombap": {
        "name": "Boom bap", "bpm": 90, "mode": "minor", "prog": ["i7", "iv7", "i7", "iv7"], "wrap": "swingBy (1/9) 4 $ ",
        "drums": [(T("Bombo y caja", "Kick and snare"), 'swingBy (1/9) 4 $ s "[bd ~ ~ ~ ~ ~ ~ bd ~ ~ bd ~ ~ ~ ~ ~, ~ ~ ~ ~ sn:3 ~ ~ ~ ~ ~ ~ ~ sn:3 ~ ~ ~]" # gain 1.1'),
                  (T("Platos", "Hi-hats"), 'swingBy (1/9) 4 $ s "hh*8" # gain "[0.9 0.6]*4" # pan 0.55')],
        "bass": {"name": T("Contrabajo", "Upright bass"), "patterns": ["R ~ ~ ~ ~ ~ ~ R ~ ~ T ~ ~ ~ ~ ~", "R ~ ~ R ~ ~ ~ F ~ ~ O ~ ~ ~ ~ A"],
                 "sound": "acoustic_bass_fluid", "fx": "# legato 1.2 # gain 1", "center": 38,
                 "why": T("toca donde toca el bombo, para que los dos suenen como un solo golpe", "plays where the kick plays, so both sound like one hit")},
        "comp": {"name": T("Piano eléctrico troceado", "Chopped electric piano"), "patterns": ["x ~ ~ x ~ ~ x ~"], "sound": "electric_piano_1_fluid",
                 "fx": "# legato 0.7 # gain 0.8 # lpf 3200 # room 0.2", "center": 62,
                 "why": T("acordes de séptima cortados en golpes, como un sample", "seventh chords cut into hits, like a sample")},
        "lead": {"name": T("Trompeta con sordina", "Muted trumpet"), "rhythms": ["x ~ x ~ x ~ ~ ~", "x ~ x ~ x ~ x ~"], "sound": "muted_trumpet_fluid",
                 "fx": "# legato 0.9 # gain 0.75 # room 0.3", "center": 74},
    },
    "afrobeat": {
        "name": "Afrobeat", "bpm": 110, "mode": "minor", "prog": ["i7", "IV7", "i7", "IV7"],
        "drums": [(T("Platos", "Hi-hats"), 's "[hh hh ho hh]*4" # gain "[0.8 0.55 0.7 0.55]*4" # cut 1 # pan 0.6'),
                  (T("Shekere", "Shekere"), 's "shaker_large*16" # gain "[1 0.55 0.75 0.55]*4" # pan 0.7 # hpf 2500'),
                  (T("Bombo y caja", "Kick and snare"), 's "[bd ~ ~ bd ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~, ~ ~ sn:1 ~ sn ~ ~ sn:1 ~ sn:1 ~ ~ sn ~ sn:1 ~]" # gain "[1 0.9 0.45 0.9]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R ~ ~ R ~ T ~ F ~ ~ O ~ F ~ T ~", "R ~ ~ R ~ F ~ S ~ ~ O ~ S ~ F ~"], "sound": "electric_bass_finger_fluid",
                 "fx": "# legato 0.7 # gain 1", "center": 40,
                 "why": T("repite la misma frase subiendo por el acorde, como un mantra", "repeats the same phrase climbing the chord, like a mantra")},
        "comp": {"name": T("Guitarra rítmica", "Rhythm guitar"), "patterns": ["~ ~ x ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ x"], "sound": "electric_guitar_clean_fluid",
                 "fx": "# legato 0.3 # gain 0.75 # pan 0.7", "center": 66,
                 "why": T("acordes cortos en los huecos que deja la guitarra tenor", "short chords in the gaps the tenor guitar leaves")},
        "lead": {"name": T("Saxo tenor", "Tenor sax"), "rhythms": ["x ~ ~ x x ~ x ~ x ~ ~ ~ x ~ x ~", "x ~ ~ x x ~ ~ ~ x ~ x ~ x ~ ~ ~"], "sound": "tenor_sax_fluid",
                 "fx": "# legato 0.9 # gain 0.75 # room 0.25", "center": 66},
    },
    "bachata": {
        "name": "Bachata", "bpm": 128, "mode": "minor", "prog": ["i", "iv", "V7", "i"],
        "drums": [(T("Güira", "Güira"), 's "[guiro:3 guiro:1]*4" # gain "[1 0.6]*4" # cut 1 # hpf 2500 # pan 0.65'),
                  (T("Bongó", "Bongo"), 's "bongos:0 bongos:6 bongos:2 bongos:6 bongos:0 bongos:6 bongos:16 bongos:7" # gain "0.9 0.65 0.85 0.65 0.9 0.65 1 0.75" # pan 0.4')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["~ R ~ L ~ R L ~", "~ R ~ L ~ R ~ N"], "sound": "electric_bass_finger_fluid",
                 "fx": "# legato 0.6 # gain 0.95", "center": 45,
                 "why": T("entra en el «y» del 1 y salta a la quinta: el paso del baile", "comes in on the «and» of 1 and jumps to the fifth: the dance step")},
        "comp": {"name": T("Segunda guitarra", "Second guitar"), "patterns": ["0 1 2 3 1 2 3 2"], "sound": "acoustic_guitar_steel_fluid",
                 "fx": "# legato 1 # gain 0.7 # pan 0.35", "center": 60,
                 "why": T("arpegia el acorde nota a nota en corcheas", "arpeggiates the chord note by note in eighths")},
        "lead": {"name": T("Requinto", "Requinto"), "rhythms": ["x x x x x x x x ~ ~ x x x ~ x ~", "x x x x x x x x ~ ~ x ~ x ~ ~ ~"], "sound": "acoustic_guitar_nylon_fluid",
                 "fx": "# legato 0.9 # gain 0.75 # room 0.2 # pan 0.6", "center": 76},
    },
}


# ---------------------------------------------------------------- armonía

ROMAN_RE = re.compile(r"^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|maj7|7)?$")
NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii"]


def roman_chord(sym, tonic, mode):
    """«V7» en La menor → {"root": 4, "tidal": "dom7"}. Los grados se cuentan en la escala del estilo."""
    m = ROMAN_RE.match(sym)
    if not m:
        return {"root": tonic, "tidal": "major"}
    acc, num, suf = m.groups()
    deg = NUMERALS.index(num.lower())
    scale = MINOR_SCALE if mode == "minor" else MAJOR_SCALE
    root = (tonic + scale[deg] + (1 if acc == "#" else -1 if acc == "b" else 0)) % 12
    upper = num.isupper()
    if suf == "°":
        q = "dim"
    elif suf == "maj7":
        q = "major7"
    elif suf == "7":
        q = "dom7" if upper else "min7"
    else:
        q = "major" if upper else "minor"
    return {"root": root, "tidal": q}


def chord_name(c):
    return KEY_NAMES[c["root"]] + SUFFIX.get(c["tidal"], "")


def seventh(c, key_root):
    """Para jazz, bossa, lo-fi…: tríadas → acordes de séptima (el V pasa a dominante)."""
    q = c["tidal"]
    if q == "major":
        q = "dom7" if (c["root"] - key_root) % 12 in (7, 10) else "major7"
    elif q == "minor":
        q = "min7"
    return {**c, "tidal": q}


def nearest(pc, center):
    """La nota de clase pc (0-11) más cerca de center."""
    p = center - ((center - pc) % 12)
    return p + 12 if center - p > 6 else p


def voicing(c, center, prev=None):
    """Notas del acorde en posición cerrada, en la inversión más cercana a center (y al acorde anterior)."""
    iv = QUALITY.get(c["tidal"], QUALITY["major"])
    best = None
    for inv in range(len(iv)):
        pcs = list(iv[inv:]) + [x + 12 for x in iv[:inv]]
        for octv in range(-2, 3):
            base = nearest(c["root"], center) + 12 * octv
            notes = [base + x for x in pcs]
            mean = sum(notes) / len(notes)
            cost = abs(mean - center)
            if prev and len(prev) == len(notes):
                cost += 0.35 * sum(abs(a - b) for a, b in zip(notes, prev)) / len(notes)
            if best is None or cost < best[0]:
                best = (cost, notes)
    return best[1]


def nm(p):
    return f"{NOTE_NAMES[p % 12]}{p // 12}"


TOKEN = re.compile(r"[A-Za-z0-9]+")


def bass_bar(pattern, c, nxt, center):
    root = nearest(c["root"], center)
    third = 3 if c["tidal"] in ("minor", "min7", "dim") else 4
    sev = 11 if c["tidal"] == "major7" else 10
    nroot = nearest(nxt["root"], root)
    vals = {"R": root, "L": root - 5, "F": root + 7, "T": root + third, "O": root + 12, "S": root + sev,
            "N": nroot, "A": nroot - 1}
    return TOKEN.sub(lambda m: nm(vals[m.group(0)]) if m.group(0) in vals else m.group(0), pattern)


def comp_bar(pattern, notes):
    def rep(m):
        t = m.group(0)
        if t == "x":
            return "[" + ",".join(nm(p) for p in notes) + "]"
        if t.isdigit():
            i = int(t)
            return nm(notes[i % len(notes)] + 12 * (i // len(notes)))
        return t
    return TOKEN.sub(rep, pattern)


def _one_group(b):
    """¿Es «[…]» un solo grupo (los corchetes de fuera se cierran al final)?"""
    if not (b.startswith("[") and b.endswith("]")):
        return False
    depth = 0
    for i, ch in enumerate(b):
        depth += ch == "["
        depth -= ch == "]"
        if depth == 0 and i < len(b) - 1:
            return False
    return True


def join_bars(bars):
    """Un patrón por compás → «<[…] […]>» (o uno solo si todos son iguales)."""
    if all(b == bars[0] for b in bars):
        return bars[0]
    return "<" + " ".join(b if " " not in b or _one_group(b) else f"[{b}]" for b in bars) + ">"


# ---------------------------------------------------------------- melodía nueva

def _scale_pcs(key):
    sc = MINOR_SCALE if key["mode"] == "minor" else MAJOR_SCALE
    return sorted((key["root"] + x) % 12 for x in sc)


def _scale_notes(key, lo, hi):
    pcs = set(_scale_pcs(key))
    return [p for p in range(lo, hi + 1) if p % 12 in pcs]


def _chord_tones(c, lo, hi):
    pcs = {(c["root"] + x) % 12 for x in QUALITY.get(c["tidal"], QUALITY["major"])}
    return [p for p in range(lo, hi + 1) if p % 12 in pcs]


def _phrase(rhythm, c, key, prev, rng, lo, hi, end_long=False):
    """Una frase de un compás: notas del acorde en las partes fuertes y pasos de la escala en medio."""
    n = rhythm.count("x")
    tones = _chord_tones(c, lo, hi)
    scale = _scale_notes(key, lo, hi)
    # incluye notas de paso cromáticas del acorde (p. ej. la sensible en el V de una tonalidad menor)
    scale = sorted(set(scale) | set(tones))
    out, p = [], prev
    for k in range(n):
        last = k == n - 1
        if k % 2 == 0 or (last and end_long):
            cands = sorted(tones, key=lambda x: (abs(x - p), x))[:3]
            if last and end_long:  # acabar la frase en la raíz o la tercera
                cands = sorted([t for t in tones if (t - c["root"]) % 12 in (0, 3, 4)], key=lambda x: abs(x - p))[:2] or cands
            p = rng.choice(cands[:2]) if len(cands) > 1 and rng.random() < 0.4 else cands[0]
        else:
            i = min(range(len(scale)), key=lambda j: abs(scale[j] - p))
            mid = (lo + hi) / 2
            step = rng.choice((1, 1, 2)) * (1 if (p < mid if rng.random() < 0.7 else rng.random() < 0.5) else -1)
            p = scale[max(0, min(len(scale) - 1, i + step))]
        out.append(p)
    it = iter(out)
    return TOKEN.sub(lambda m: nm(next(it)) if m.group(0) == "x" else m.group(0), rhythm), out


def _transpose(notes, scale, steps):
    out = []
    for p in notes:
        i = min(range(len(scale)), key=lambda j: abs(scale[j] - p))
        out.append(scale[max(0, min(len(scale) - 1, i + steps))])
    return out


def _fill(rhythm, notes):
    it = iter(notes)
    return TOKEN.sub(lambda m: nm(next(it)) if m.group(0) == "x" else m.group(0), rhythm)


def _top_tokens(r):
    """Trozos de primer nivel de un ritmo («[x ~] x ~ x» → ["[x ~]", "x", "~", "x"])."""
    out, depth, cur = [], 0, ""
    for ch in r:
        if ch == " " and depth == 0:
            if cur:
                out.append(cur)
            cur = ""
            continue
        depth += ch == "["
        depth -= ch == "]"
        cur += ch
    if cur:
        out.append(cur)
    return out


def _displace(r):
    """Desplazamiento rítmico: el motivo empieza un paso más tarde (la última parte pasa al principio)."""
    t = _top_tokens(r)
    return " ".join(t[-1:] + t[:-1]) if len(t) > 2 else r


def _breathe(r):
    """Cadencia: la primera mitad del ritmo y luego silencio (la frase respira)."""
    t = _top_tokens(r)
    if len(t) < 4:
        return r
    half = len(t) // 2
    xs = [i for i, x in enumerate(t[:half]) if "x" in x]
    if not xs:
        return r
    last = xs[-1]
    return " ".join(t[:last + 1] + ["~"] * (len(t) - last - 1))


def _invert(notes, scale):
    """Inversión: los mismos pasos de escala, pero hacia el otro lado."""
    if not notes:
        return notes
    idx = [min(range(len(scale)), key=lambda j: abs(scale[j] - p)) for p in notes]
    first = idx[0]
    return [scale[max(0, min(len(scale) - 1, first - (i - first)))] for i in idx]


def _to_chord(notes, c, lo, hi, scale):
    """La primera nota del motivo cae en una nota del acorde; el resto se mueve los mismos pasos de escala."""
    if not notes:
        return notes
    tones = _chord_tones(c, lo - 5, hi + 5)
    target = min(tones, key=lambda t: abs(t - notes[0]))
    i0 = min(range(len(scale)), key=lambda j: abs(scale[j] - notes[0]))
    it = min(range(len(scale)), key=lambda j: abs(scale[j] - target))
    return _transpose(notes, scale, it - i0)


def new_melody(lead, chords, key, rng, plan=None):
    """Melodía con motivo (Maestro v2): un motivo de un compás que se desarrolla.

    Por cada frase de 4 compases: 1 motivo (pregunta) · 2 respuesta con el motivo desplazado · 3 el motivo en secuencia
    sobre su acorde (o invertido en la segunda frase) · 4 cadencia que respira (silencio al final). El clímax (la nota más
    aguda) llega en el compás 3 de la última frase, y la última nota es la tónica. `plan` recibe qué hace cada compás.
    """
    lo, hi = lead["center"] - 7, lead["center"] + 10
    ra, rb = lead["rhythms"][0], lead["rhythms"][-1]
    scale = _scale_notes(key, lo - 12, hi + 12)
    n = len(chords)
    climax = ((n - 1) // 4) * 4 + 2 if n >= 4 and ((n - 1) // 4) * 4 + 2 < n - 1 else -1
    bars, prev, motif = [], lead["center"], None
    plan = plan if plan is not None else []
    for b, c in enumerate(chords):
        pos, phrase = b % 4, b // 4
        last = b == n - 1
        if motif is None:
            r = ra
            _, notes = _phrase(ra, c, key, prev, rng, lo, hi)
            motif = notes
            what = "motivo"
        elif pos == 0 and not last:
            r = ra
            notes = _to_chord(_invert(motif, scale) if phrase % 2 else motif, c, lo, hi, scale)
            what = "motivo invertido" if phrase % 2 else "motivo"
        elif pos == 1 and not last and _displace(ra).count("x") == len(motif):
            r = _displace(ra)
            notes = _to_chord(_transpose(motif, scale, -1), c, lo, hi, scale)
            what = "respuesta (motivo desplazado)"
        elif pos == 2 and not last:
            r = ra
            notes = _to_chord(_transpose(motif, scale, 2 if b == climax else 1), c, lo, hi, scale)
            if b == climax:
                # clímax: el motivo sube hasta lo más agudo de la tesitura
                up = 0
                while max(notes) + 1 <= hi + 3 and up < 2:
                    notes = _transpose(notes, scale, 1)
                    up += 1
                what = "clímax"
            else:
                what = "secuencia"
        elif pos == 1 and not last:
            r = rb
            _, notes = _phrase(rb, c, key, prev, rng, lo, hi)
            what = "respuesta"
        else:
            r = _breathe(rb)
            _, notes = _phrase(r, c, key, prev, rng, lo, hi, end_long=True)
            if last and notes:
                tonic = [p for p in range(lo - 5, hi + 6) if p % 12 == key["root"]]
                if tonic:
                    notes[-1] = min(tonic, key=lambda p: abs(p - notes[-1]))
            what = "cadencia"
        notes = [min(max(p, lo - 3), hi + 5) for p in notes]
        if notes:
            prev = notes[-1]
        plan.append(what)
        bars.append(_fill(r, notes))
    return bars


# ---------------------------------------------------------------- de tu MIDI

SND_RE = re.compile(r'#\s*s\s+"[^"]*"')


def restyle(code, sound):
    return SND_RE.sub(f'# s "{sound}"', code) if SND_RE.search(code) else f'{code} # s "{sound}"'


def pick_parts(tracks):
    """Separa las pistas importadas en batería, bajo, melodía y acompañamiento."""
    drums = [t for t in tracks if t["tipo"] == "percusion"]
    bass = [t for t in tracks if t["tipo"] == "bajo"]
    tonal = [t for t in tracks if t["tipo"] not in ("percusion", "bajo")]
    melody = [t for t in tonal if t["tipo"] == "melodia"]
    if not melody:
        # sin pista de «melodía»: la más aguda que toque notas sueltas (no acordes) hace de melodía
        single = [t for t in tonal if t["codigo"].count(",") * 3 < len(re.findall(r"[a-g][sf]?\d", t["codigo"]))]
        if single:
            melody = [max(single, key=lambda t: t.get("avg", 0))]
    return drums, bass, melody[:2], [t for t in tonal if t not in melody]


# ---------------------------------------------------------------- generar

def generate(data, style="merengue", keep=("melody", "chords"), seed=1, lang="es", start_bar=None, bars=4, name=""):
    st = STYLES.get(style)
    if not st:
        raise ValueError("Estilo desconocido|Unknown style")
    es = lang != "en"
    tx = lambda d: d["es"] if es else d["en"]  # noqa: E731
    keep = {k for k in keep if k in ROLES}
    rng = random.Random(f"{style}:{seed}")
    imp = analyse(data, lang, start_bar, bars, name)
    s = imp["summary"]
    nbars = s["window"]["bars"]
    key = s["key"] or {"root": 0, "mode": "major", "name": "C"}
    drums_m, bass_m, melody_m, _ = pick_parts(imp["tracks"])
    notes = []  # qué he hecho, para el chat

    # Acordes: los tuyos (rellenando los compases sin acorde) o la progresión típica del estilo en tu tonalidad
    mine = s["window"].get("chord_data") or []
    if "chords" in keep and any(mine):
        chords, last = [], next(c for c in mine if c)
        for c in mine:
            last = c or last
            chords.append({"root": last["root"], "tidal": last["tidal"]})
        if st.get("sevenths"):
            chords = [seventh(c, key["root"]) for c in chords]
        src = T("tus acordes", "your chords")
    else:
        tonic = key["root"]
        if st["mode"] == "minor" and key["mode"] != "minor":
            tonic = (tonic + 9) % 12  # relativa menor: las mismas notas que tu canción
        elif st["mode"] == "major" and key["mode"] == "minor":
            tonic = (tonic + 3) % 12
        chords = [roman_chord(st["prog"][b % len(st["prog"])], tonic, st["mode"]) for b in range(nbars)]
        src = T(f"la progresión típica del {st['name']} ({' '.join(st['prog'])})", f"the typical {st['name']} progression ({' '.join(st['prog'])})")
        if "chords" in keep:
            notes.append(T("Tu MIDI no tiene acordes claros en este trozo, así que uso la progresión típica del estilo.",
                           "Your MIDI has no clear chords in this section, so I use the style's typical progression."))
        key = {"root": tonic, "mode": st["mode"], "name": KEY_NAMES[tonic] + ("m" if st["mode"] == "minor" else "")}
    names = [chord_name(c) for c in chords]
    wrap = st.get("wrap", "")
    out = []

    # Batería
    if "drums" in keep and drums_m:
        for t in drums_m:
            out.append({"nombre": t["nombre"], "tipo": "percusion", "codigo": t["codigo"], "origen": "midi",
                        "explicacion": T("Tu batería, tal cual.", "Your drums, as they are.")})
    else:
        if "drums" in keep:
            notes.append(T("Tu MIDI no tiene batería en este trozo: pongo la del estilo.", "Your MIDI has no drums in this section: I use the style's."))
        for nme, code in st["drums"]:
            out.append({"nombre": tx(nme), "tipo": "percusion", "codigo": code, "origen": "style",
                        "explicacion": T(f"Ritmo de {st['name']} del curso de género.", f"{st['name']} rhythm from the genre course.")})

    # Bajo
    b = st["bass"]
    if "bass" in keep and bass_m:
        out.append({"nombre": tx(T("Tu bajo", "Your bass")), "tipo": "bajo", "codigo": restyle(bass_m[0]["codigo"], b["sound"]), "origen": "midi",
                    "explicacion": T(f"Tus notas de bajo, con el sonido del {st['name']} ({b['sound']}).", f"Your bass notes, with the {st['name']} sound ({b['sound']}).")})
    else:
        if "bass" in keep:
            notes.append(T("Tu MIDI no tiene bajo en este trozo: escribo uno del estilo.", "Your MIDI has no bass in this section: I write one in the style."))
        pat = b["patterns"][rng.randrange(len(b["patterns"]))]
        bb = [bass_bar(pat, c, chords[(i + 1) % nbars], b["center"]) for i, c in enumerate(chords)]
        out.append({"nombre": tx(b["name"]), "tipo": "bajo", "codigo": f'{wrap}note "{join_bars(bb)}" # s "{b["sound"]}" {b["fx"]}', "origen": "new",
                    "explicacion": T(f"Bajo nuevo sobre {src['es']}: {b['why']['es']}.", f"New bass over {src['en']}: {b['why']['en']}.")})

    # Acompañamiento (siempre en el estilo: tus acordes, tocados como los toca ese género)
    cp = st["comp"]
    pat = cp["patterns"][rng.randrange(len(cp["patterns"]))]
    prev, cb = None, []
    for c in chords:
        v = voicing(c, cp["center"], prev)
        prev = v
        cb.append(comp_bar(pat, v))
    out.append({"nombre": tx(cp["name"]), "tipo": cp.get("kind", "armonia"),
                "codigo": f'{cp.get("wrap", "")}{wrap}note "{join_bars(cb)}" # s "{cp["sound"]}" {cp["fx"]}', "origen": "midi" if "chords" in keep and src["en"] == "your chords" else "new",
                "explicacion": T(f"Acordes ({' '.join(names)}): {src['es']}, tocados como en el {st['name']}: {cp['why']['es']}.",
                                 f"Chords ({' '.join(names)}): {src['en']}, played the {st['name']} way: {cp['why']['en']}.")})

    # Melodía
    ld = st["lead"]
    if "melody" in keep and melody_m:
        for i, t in enumerate(melody_m):
            out.append({"nombre": tx(T("Tu melodía", "Your melody")) + (f" {i + 1}" if i else ""), "tipo": "melodia",
                        "codigo": restyle(t["codigo"], ld["sound"]) if i == 0 else t["codigo"], "origen": "midi",
                        "explicacion": T(f"Tu melodía, nota por nota, tocada con {tx(ld['name']).lower()} ({ld['sound']}).",
                                         f"Your melody, note for note, played on {tx(ld['name']).lower()} ({ld['sound']}).")})
    else:
        if "melody" in keep:
            notes.append(T("No encuentro una melodía en tu MIDI en este trozo: invento una.", "I can't find a melody in your MIDI in this section: I make one up."))
        mb = new_melody(ld, chords, key, rng)
        out.append({"nombre": tx(ld["name"]), "tipo": "melodia", "codigo": f'{wrap}note "{join_bars(mb)}" # s "{ld["sound"]}" {ld["fx"]}', "origen": "new",
                    "explicacion": T("Melodía nueva con motivo: el compás 1 presenta el motivo, el 2 le contesta desplazado, el 3 lo lleva en secuencia sobre su acorde y el 4 respira en una cadencia; la segunda frase lo invierte y sube al clímax antes de cerrar en la tónica.",
                                     "New motif melody: bar 1 states the motif, bar 2 answers it displaced, bar 3 sequences it over its chord and bar 4 breathes in a cadence; the second phrase inverts it and climbs to the climax before closing on the tonic.")})

    bpm = s["studio_bpm"] if "tempo" in keep else st["bpm"]
    out = out[:12]
    gen = {
        "style": style, "style_name": st["name"], "keep": sorted(keep), "seed": seed, "bpm": bpm,
        "key": key.get("name"), "chords": names,
        "notes": [tx(n) for n in notes],
    }
    kept = ", ".join(tx(T({"melody": "melodía", "chords": "acordes", "bass": "bajo", "drums": "batería", "tempo": "tempo"}[k], k)) for k in sorted(keep)) or "—"
    ref = imp["reference"] + "\n" + (
        f"VERSIÓN GENERADA: el alumno ha generado una versión en estilo {st['name']} de SU MIDI (es suyo; puedes trabajar con sus notas). "
        f"Conserva de su MIDI: {kept}. Acordes por compás: {' '.join(names)}. Tempo {bpm} BPM. Pistas: "
        + "; ".join(f'{t["nombre"]} ({t["origen"]})' for t in out) + ". Si te pide variarla o alargarla, mantén lo que ha decidido conservar.")
    return {"summary": s, "generated": gen, "tracks": [{k: v for k, v in t.items() if k != "explicacion"} | {"explicacion": tx(t["explicacion"])} for t in out],
            "reference": ref}


# ---------------------------------------------------------------- «Otra versión» en los pasos de los cursos

# Tonalidad de cada curso (la misma que su progresión en web/courses.js)
COURSE_KEYS = {"merengue": (0, "major"), "salsa": (9, "minor"), "cumbia": (9, "minor"), "reggaeton": (9, "minor"), "bossa": (0, "major"),
               "jazz": (0, "major"), "funk": (4, "minor"), "house": (9, "minor"), "techno": (9, "minor"), "dnb": (2, "minor"), "lofi": (0, "major"),
               "reggae": (9, "minor"), "boombap": (2, "minor"), "afrobeat": (4, "minor"), "bachata": (9, "minor")}
PLAN_TXT = {"motivo": ("motivo", "motif"), "motivo invertido": ("motivo invertido", "inverted motif"),
            "respuesta (motivo desplazado)": ("respuesta desplazada", "displaced answer"), "respuesta": ("respuesta", "answer"),
            "secuencia": ("secuencia", "sequence"), "clímax": ("clímax", "climax"), "cadencia": ("cadencia", "cadence")}


def _keep_sound(code, sound, fx):
    """Si la pista del curso es `note "…" # s … # efectos`, la versión nueva conserva su sonido y sus efectos."""
    import score as _score
    s, f = _score.fx_of(code or "")
    return (s or sound), (f if s else fx)


BASS_LEGEND = [("R", "raíz", "root"), ("L", "quinta por debajo", "fifth below"), ("F", "quinta", "fifth"), ("T", "tercera", "third"),
               ("O", "octava", "octave"), ("S", "séptima", "seventh"), ("N", "anticipa el acorde siguiente", "anticipates the next chord"),
               ("A", "nota de paso hacia el acorde siguiente", "approach note into the next chord")]


def course_variants(style, role, code="", bars=None, n=3, seed=1, lang="es", key=None):
    """3 versiones de la pista de un paso del curso (melodía, bajo o acordes) sobre el resto de la canción congelado."""
    import score as _score
    st = STYLES.get(style)
    if not st:
        raise ValueError("Estilo desconocido|Unknown style")
    es = lang != "en"
    tx = lambda d: d["es"] if es else d["en"]  # noqa: E731
    root, mode = key or COURSE_KEYS.get(style, (0, st["mode"]))
    key = {"root": root, "mode": mode, "name": KEY_NAMES[root] + ("m" if mode == "minor" else "")}
    cur = _score.tidal_to_bars(code) if code else None
    nb = bars or (len(cur) if cur else 4)
    nb = max(4, min(16, nb - nb % len(st["prog"]) if nb >= len(st["prog"]) else len(st["prog"])))
    chords = [roman_chord(st["prog"][b % len(st["prog"])], root, mode) for b in range(nb)]
    out = []
    for k in range(n):
        rng = random.Random(f"{style}:{role}:{seed}:{k}")
        if role == "melodia":
            ld = dict(st["lead"])
            rh = list(ld["rhythms"])
            # cada versión parte de otro ritmo de motivo: el del estilo, el de respuesta, o el del estilo desplazado
            ld["rhythms"] = [[rh[0], rh[-1], _displace(rh[0])][k % 3]] + rh[1:]
            ld["center"] = ld["center"] + (0, -3, 2)[k % 3]
            snd, fx = _keep_sound(code, ld["sound"], ld["fx"])
            plan = []
            mb = new_melody(ld, chords, key, rng, plan)
            c = f'note "{join_bars(mb)}" # s "{snd}" {fx}'.strip()
            seen = []
            for w in plan:
                if w not in seen:
                    seen.append(w)
            title = T(f"Motivo {k + 1}", f"Motif {k + 1}")
            desc = T("Desarrollo: " + ", ".join(PLAN_TXT[w][0] for w in seen) + ".", "Development: " + ", ".join(PLAN_TXT[w][1] for w in seen) + ".")
            concept = T("Motivo y desarrollo", "Motif and development")
        elif role == "bajo":
            b = st["bass"]
            snd, fx = _keep_sound(code, b["sound"], b["fx"])
            pats = b["patterns"]
            pat = pats[k % len(pats)]
            extra = ("", "")
            if k >= len(pats):
                # anticipación: el último golpe del compás ya toca la raíz del acorde siguiente
                # (solo en patrones planos: en «[~ R]*4» cambiar la R cambiaría todos los golpes)
                hits = [m for m in re.finditer(r"\b[RLFTOSNA]\b", pat)]
                if hits and "*" not in pat and "!" not in pat and hits[-1].group(0) != "N":
                    j = hits[-1].start()
                    pat = pat[:j] + "N" + pat[j + 1:]
                    extra = (" El último golpe ya toca el acorde que viene.", " The last hit already plays the coming chord.")
            shift = (0, 12, -5)[k % 3] if k >= len(pats) else 0
            if shift:
                extra = (extra[0] + (" Una octava más arriba." if shift > 0 else " Más grave."),
                         extra[1] + (" One octave higher." if shift > 0 else " Lower."))
            center = b["center"] + shift
            bb = [bass_bar(pat, c_, chords[(i + 1) % nb], center) for i, c_ in enumerate(chords)]
            c = f'note "{join_bars(bb)}" # s "{snd}" {fx}'.strip()
            title = T(f"Bajo {k + 1}", f"Bass {k + 1}")
            legend = [(ch, es_, en_) for ch, es_, en_ in BASS_LEGEND if ch in pat]
            desc = T(f"Patrón «{pat}»: " + ", ".join(f"{ch} {es_}" for ch, es_, _ in legend) + "." + extra[0],
                     f"Pattern «{pat}»: " + ", ".join(f"{ch} {en_}" for ch, _, en_ in legend) + "." + extra[1])
            concept = T("Bajo que anticipa", "Anticipating bass")
        else:
            cp = st["comp"]
            snd, fx = _keep_sound(code, cp["sound"], cp["fx"])
            pats = cp["patterns"]
            pat = pats[k % len(pats)]
            center = cp["center"] + (0, 5, -4)[k % 3]
            prev, cb = None, []
            for c_ in chords:
                v = voicing(c_, center, prev)
                prev = v
                cb.append(comp_bar(pat, v))
            c = f'note "{join_bars(cb)}" # s "{snd}" {fx}'.strip()
            title = T(f"Acordes {k + 1}", f"Chords {k + 1}")
            desc = T("Otra posición de los acordes (voicing), con las notas comunes en su sitio.", "Another chord position (voicing), keeping the common notes in place.")
            concept = T("Voicings", "Voicings")
        out.append({"titulo": tx(title), "descripcion": tx(desc), "concepto": tx(concept), "codigo": c,
                    "bars": _score.tidal_to_bars(c)})
    return {"key": key["name"], "chords": [chord_name(c_) for c_ in chords], "variants": out}


def styles_list(lang="es"):
    return [{"id": k, "name": v["name"], "bpm": v["bpm"]} for k, v in STYLES.items()]
