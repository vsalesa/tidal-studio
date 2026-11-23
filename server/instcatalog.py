"""
Catálogo de la biblioteca de instrumentos (al estilo de GarageBand).

Cada instrumento tiene un nombre de sonido de Tidal (su id), categoría, nombre en español e inglés,
una explicación corta, de dónde sale y su licencia. Hay cuatro clases:
  - "multi": una grabación por nota (General MIDI, VSCO 2, VCSL, Salamander). Se descarga cuando lo pides
             y se toca con notas: n "c5 e5 g5" # s "harpsichord_fluid".
  - "kit":   golpes sueltos (congas, gong…). Se tocan con n 0, n 1…
  - "synth": sintetizadores de SuperDirt / Tidal Studio. No se descargan.
  - "engine": synths que necesitan un motor extra (Mi-UGens, Surge XT o Vital por VSTPlugin).
Solo biblioteca estándar.
"""

# ---------------------------------------------------------------- categorías
# (id, español, inglés, foto por defecto)
CATEGORIES = [
    ("pianos", "Pianos", "Pianos", "piano"),
    ("keys", "Pianos eléctricos y clavinet", "Electric pianos & clavs", "rhodes"),
    ("organs", "Órganos, acordeones y armónicas", "Organs, accordions & harmonicas", "pipe_organ"),
    ("early", "Antiguos y barrocos", "Early & baroque", "harpsichord"),
    ("mallets", "Láminas y campanas", "Mallets & bells", "vibraphone"),
    ("guitars", "Guitarras", "Guitars", "guitar"),
    ("basses", "Bajos y contrabajos", "Basses", "double_bass"),
    ("strings", "Cuerdas de orquesta", "Orchestral strings", "violin"),
    ("brass", "Metales", "Brass", "trumpet"),
    ("woodwinds", "Maderas y vientos", "Woodwinds", "flute"),
    ("voices", "Coros y voces", "Choirs & voices", "choir"),
    ("world", "Instrumentos del mundo", "World instruments", "sitar"),
    ("percussion", "Percusión", "Percussion", "drums"),
    ("synth_lead", "Synth: solistas", "Synth leads", "synthesizer"),
    ("synth_pad", "Synth: pads y colchones", "Synth pads", "analog_synth"),
    ("synth_bass", "Synth: bajos", "Synth basses", "synthesizer"),
    ("synth_keys", "Synth: teclados y pulsos", "Synth keys & plucks", "analog_synth"),
    ("synth_fx", "Synth: efectos y texturas", "Synth FX & textures", "eurorack"),
    ("engines", "Motores de synth (plugins)", "Synth engines (plugins)", "eurorack"),
    ("fx", "Efectos de sonido", "Sound effects", "eurorack"),
    ("mine", "Mis instrumentos", "My instruments", "analog_synth"),
]
CAT_IDS = [c[0] for c in CATEGORIES]

# ---------------------------------------------------------------- fuentes y licencias
GLEITZ = "https://gleitz.github.io/midi-js-soundfonts/"
SOURCES = {
    "fluid": {"name": "FluidR3 GM", "short": "FluidR3", "base": GLEITZ + "FluidR3_GM/", "license": "CC BY 3.0",
              "license_url": "https://creativecommons.org/licenses/by/3.0/", "author": "Frank Wen (FluidR3 SoundFont), rendered by Benjamin Gleitzman",
              "home": "https://github.com/gleitz/midi-js-soundfonts",
              "es": "SoundFont General MIDI clásico, equilibrado y ligero.", "en": "The classic General MIDI SoundFont: balanced and light."},
    "musyng": {"name": "Musyng Kite", "short": "Musyng Kite", "base": GLEITZ + "MusyngKite/", "license": "CC BY-SA 3.0",
               "license_url": "https://creativecommons.org/licenses/by-sa/3.0/", "author": "Musyng Kite SoundFont, rendered by Benjamin Gleitzman",
               "home": "https://github.com/gleitz/midi-js-soundfonts",
               "es": "SoundFont enorme (1,7 GB original): sonidos más ricos y realistas.", "en": "A huge SoundFont (1.7 GB original): richer, more realistic sounds."},
    "fatboy": {"name": "FatBoy", "short": "FatBoy", "base": GLEITZ + "FatBoy/", "license": "CC BY-SA 3.0",
               "license_url": "https://creativecommons.org/licenses/by-sa/3.0/", "author": "FatBoy SoundFont (fatboy.site), rendered by Benjamin Gleitzman",
               "home": "https://github.com/gleitz/midi-js-soundfonts",
               "es": "SoundFont con carácter: más cuerpo y brillo.", "en": "A SoundFont with character: more body and shine."},
    "vsco2": {"name": "VSCO 2 Community Edition", "short": "VSCO 2", "license": "CC0",
              "license_url": "https://creativecommons.org/publicdomain/zero/1.0/", "author": "Versilian Studios",
              "home": "https://github.com/sgossner/VSCO-2-CE",
              "es": "Orquesta grabada nota a nota por Versilian Studios.", "en": "An orchestra recorded note by note by Versilian Studios."},
    "vcsl": {"name": "VCSL (Versilian Community Sample Library)", "short": "VCSL", "license": "CC0",
             "license_url": "https://creativecommons.org/publicdomain/zero/1.0/", "author": "Versilian Studios",
             "home": "https://github.com/sgossner/VCSL",
             "es": "Cientos de instrumentos reales grabados por Versilian Studios.", "en": "Hundreds of real instruments recorded by Versilian Studios."},
    "salamander": {"name": "Salamander Grand Piano", "short": "Salamander", "license": "CC BY 3.0",
                   "license_url": "https://creativecommons.org/licenses/by/3.0/", "author": "Alexander Holm",
                   "home": "https://github.com/felixroos/dough-samples",
                   "es": "Un piano de cola Yamaha C5 grabado nota a nota.", "en": "A Yamaha C5 grand piano recorded note by note."},
    "superdirt": {"name": "SuperDirt", "short": "SuperDirt", "license": "GPL-2.0", "license_url": "https://github.com/musikinformatik/SuperDirt",
                  "author": "SuperDirt contributors", "home": "https://github.com/musikinformatik/SuperDirt",
                  "es": "Sintetizadores que vienen con Tidal.", "en": "Synths that come with Tidal."},
    "studio": {"name": "Tidal Studio", "short": "Tidal Studio", "license": "MIT", "license_url": "", "author": "Tidal Studio",
               "home": "https://github.com/vsalesa/tidal-studio",
               "es": "Sintetizadores propios de Tidal Studio (no necesitan plugins).", "en": "Tidal Studio's own synths (no plugins needed)."},
    "mi": {"name": "Mi-UGens (Mutable Instruments)", "short": "Mutable", "license": "GPL-3.0", "license_url": "https://github.com/v7b1/mi-UGens",
           "author": "Émilie Gillet (Mutable Instruments), SuperCollider port by Volker Böhm", "home": "https://github.com/v7b1/mi-UGens",
           "es": "Los módulos Plaits, Braids y Rings de Mutable Instruments.", "en": "Mutable Instruments' Plaits, Braids and Rings modules."},
    "surge": {"name": "Surge XT", "short": "Surge XT", "license": "GPL-3.0", "license_url": "https://surge-synthesizer.github.io/",
              "author": "Surge Synth Team", "home": "https://surge-synthesizer.github.io/",
              "es": "Synth profesional y gratuito, con cientos de sonidos de fábrica.", "en": "A free, professional synth with hundreds of factory sounds."},
    "vital": {"name": "Vital", "short": "Vital", "license": "Free (Vital Audio)", "license_url": "https://vital.audio/",
              "author": "Matt Tytel (Vital Audio)", "home": "https://vital.audio/",
              "es": "Synth de tablas de ondas gratuito.", "en": "A free wavetable synth."},
    "user": {"name": "Tuyo", "short": "Mine", "license": "", "license_url": "", "author": "", "home": "",
             "es": "Instrumento que has añadido tú.", "en": "An instrument you added."},
}

# ---------------------------------------------------------------- General MIDI (128 instrumentos × 3 juegos de sonidos)
# nombre GM | categoría | español | inglés | nota más grave | más aguda (MIDI) | foto | palabras para buscar
GM = """
acoustic_grand_piano|pianos|Piano de cola|Grand piano|21|108|piano|steinway cola concierto
bright_acoustic_piano|pianos|Piano brillante|Bright piano|21|108|piano|pop rock
electric_grand_piano|pianos|Piano de cola eléctrico (CP-70)|Electric grand (CP-70 style)|28|103|piano|yamaha cp70 ochentas
honkytonk_piano|pianos|Piano honky-tonk (desafinado de bar)|Honky-tonk piano|28|103|upright_piano|saloon western bar ragtime
electric_piano_1|keys|Piano eléctrico de púas (estilo Rhodes)|Tine electric piano (Rhodes style)|28|103|rhodes|rhodes fender soul jazz neo-soul
electric_piano_2|keys|Piano eléctrico FM (estilo DX7)|FM electric piano (DX7 style)|28|103|rhodes|dx7 yamaha ochentas balada
harpsichord|early|Clavecín (clave)|Harpsichord|29|89|harpsichord|clavicordio clavicémbalo barroco bach
clavinet|keys|Clavinet|Clavinet|29|89|clavinet|hohner funk stevie wonder
celesta|mallets|Celesta|Celesta|60|108|celesta|cascanueces campanitas navidad
glockenspiel|mallets|Glockenspiel|Glockenspiel|72|108|glockenspiel|carillón lira
music_box|mallets|Caja de música|Music box|60|96|music_box|nana bebé
vibraphone|mallets|Vibráfono|Vibraphone|53|89|vibraphone|jazz vibes
marimba|mallets|Marimba|Marimba|45|96|marimba|madera latino
xylophone|mallets|Xilófono|Xylophone|65|108|xylophone|madera
tubular_bells|mallets|Campanas tubulares|Tubular bells|60|77|tubular_bells|iglesia campanario
dulcimer|world|Dulcémele (salterio de martillos)|Hammered dulcimer|48|84|dulcimer|santur cimbalom yangqin
drawbar_organ|organs|Órgano de barras (estilo Hammond)|Drawbar organ (Hammond style)|36|96|hammond|hammond b3 gospel blues
percussive_organ|organs|Órgano percusivo|Percussive organ|36|96|hammond|hammond jazz
rock_organ|organs|Órgano de rock|Rock organ|36|96|hammond|deep purple
church_organ|organs|Órgano de iglesia|Church organ|24|96|pipe_organ|tubos catedral misa
reed_organ|organs|Armonio|Reed organ (harmonium)|36|96|accordion|armonio harmonium
accordion|organs|Acordeón|Accordion|53|89|accordion|vals francés musette
harmonica|organs|Armónica|Harmonica|60|96|harmonica|blues
tango_accordion|organs|Bandoneón|Bandoneon (tango accordion)|53|89|accordion|tango piazzolla argentina
acoustic_guitar_nylon|guitars|Guitarra española (nailon)|Nylon guitar (classical)|40|84|guitar|clásica flamenco bossa española
acoustic_guitar_steel|guitars|Guitarra acústica (cuerdas de acero)|Steel-string acoustic guitar|40|84|steel_guitar|folk country pop
electric_guitar_jazz|guitars|Guitarra eléctrica de jazz|Jazz electric guitar|40|84|electric_guitar|jazz hollow body
electric_guitar_clean|guitars|Guitarra eléctrica limpia|Clean electric guitar|40|84|electric_guitar|stratocaster funk pop
electric_guitar_muted|guitars|Guitarra eléctrica apagada (palm mute)|Muted electric guitar|40|84|electric_guitar|funk palm mute
overdriven_guitar|guitars|Guitarra saturada|Overdriven guitar|40|84|electric_guitar|rock crunch
distortion_guitar|guitars|Guitarra con distorsión|Distortion guitar|40|84|electric_guitar|metal heavy
guitar_harmonics|guitars|Armónicos de guitarra|Guitar harmonics|52|96|electric_guitar|ambient
acoustic_bass|basses|Contrabajo de jazz (pizzicato)|Acoustic jazz bass|28|67|double_bass|contrabajo jazz walking upright
electric_bass_finger|basses|Bajo eléctrico (dedos)|Electric bass (finger)|28|67|bass|fender jazz bass funk soul
electric_bass_pick|basses|Bajo eléctrico (púa)|Electric bass (pick)|28|67|bass|rock punk
fretless_bass|basses|Bajo sin trastes|Fretless bass|28|67|bass|jaco pastorius jazz fusion
slap_bass_1|basses|Bajo slap 1|Slap bass 1|28|67|bass|funk slap
slap_bass_2|basses|Bajo slap 2|Slap bass 2|28|67|bass|funk slap
synth_bass_1|synth_bass|Bajo sintetizado 1|Synth bass 1|28|67|synthesizer|moog ochentas
synth_bass_2|synth_bass|Bajo sintetizado 2|Synth bass 2|28|67|synthesizer|ochentas
violin|strings|Violín|Violin|55|103|violin|solista clásico
viola|strings|Viola|Viola|48|91|viola|clásico
cello|strings|Violonchelo|Cello|36|84|cello|chelo violoncelo
contrabass|basses|Contrabajo con arco|Double bass (bowed)|28|67|double_bass|contrabajo arco orquesta
tremolo_strings|strings|Cuerdas en trémolo|Tremolo strings|36|96|string_orchestra|suspense cine
pizzicato_strings|strings|Cuerdas en pizzicato|Pizzicato strings|36|96|string_orchestra|pizzicato punteado
orchestral_harp|strings|Arpa de concierto|Concert harp|24|103|harp|arpa
timpani|percussion|Timbales de orquesta|Timpani|36|60|timpani|timbal orquesta
string_ensemble_1|strings|Orquesta de cuerdas|String ensemble|28|96|string_orchestra|cuerdas orquesta cine
string_ensemble_2|strings|Cuerdas lentas|Slow strings|28|96|string_orchestra|cuerdas lentas pad
synth_strings_1|synth_pad|Cuerdas sintetizadas 1|Synth strings 1|36|96|analog_synth|solina ochentas
synth_strings_2|synth_pad|Cuerdas sintetizadas 2|Synth strings 2|36|96|analog_synth|ochentas
choir_aahs|voices|Coro «aah»|Choir aahs|48|79|choir|coro voces
voice_oohs|voices|Voces «uuh»|Voice oohs|48|79|choir|voces
synth_choir|voices|Coro sintetizado|Synth choir|48|79|choir|coro ochentas
orchestra_hit|fx|Golpe de orquesta|Orchestra hit|48|84|string_orchestra|hit hip hop
trumpet|brass|Trompeta|Trumpet|54|86|trumpet|trompeta jazz mariachi
trombone|brass|Trombón|Trombone|40|77|trombone|trombón
tuba|brass|Tuba|Tuba|28|58|tuba|tuba
muted_trumpet|brass|Trompeta con sordina|Muted trumpet|54|86|trumpet|sordina miles davis
french_horn|brass|Trompa|French horn|41|77|french_horn|trompa corno
brass_section|brass|Sección de metales|Brass section|40|84|trombone|metales funk
synth_brass_1|synth_keys|Metales sintetizados 1|Synth brass 1|36|84|synthesizer|ochentas
synth_brass_2|synth_keys|Metales sintetizados 2|Synth brass 2|36|84|synthesizer|ochentas
soprano_sax|woodwinds|Saxo soprano|Soprano saxophone|56|88|saxophone_soprano|kenny g saxo
alto_sax|woodwinds|Saxo alto|Alto saxophone|49|81|sax|saxo jazz
tenor_sax|woodwinds|Saxo tenor|Tenor saxophone|44|76|sax|saxo jazz soul
baritone_sax|woodwinds|Saxo barítono|Baritone saxophone|36|69|sax|saxo
oboe|woodwinds|Oboe|Oboe|58|91|oboe|oboe
english_horn|woodwinds|Corno inglés|English horn|52|81|oboe|corno inglés
bassoon|woodwinds|Fagot|Bassoon|34|75|bassoon|fagot
clarinet|woodwinds|Clarinete|Clarinet|50|91|clarinet|clarinete klezmer
piccolo|woodwinds|Flautín|Piccolo|74|108|flute|flautín piccolo
flute|woodwinds|Flauta travesera|Flute|60|96|flute|flauta
recorder|early|Flauta dulce|Recorder|60|96|recorder|flauta dulce colegio
pan_flute|world|Flauta de pan (zampoña)|Pan flute|60|96|pan_flute|zampoña andina quena
blown_bottle|fx|Botella soplada|Blown bottle|60|96|ocarina|botella
shakuhachi|world|Shakuhachi (flauta japonesa)|Shakuhachi|55|91|shakuhachi|japón japonés zen
whistle|fx|Silbido|Whistle|60|96|flute|silbar western
ocarina|woodwinds|Ocarina|Ocarina|60|96|ocarina|zelda
lead_1_square|synth_lead|Solista de onda cuadrada|Square lead|48|96|synthesizer|chiptune 8 bits
lead_2_sawtooth|synth_lead|Solista de diente de sierra|Sawtooth lead|48|96|synthesizer|trance
lead_3_calliope|synth_lead|Solista calíope|Calliope lead|48|96|synthesizer|feria
lead_4_chiff|synth_lead|Solista «chiff»|Chiff lead|48|96|synthesizer|
lead_5_charang|synth_lead|Solista «charang» (guitarra synth)|Charang lead|48|96|synthesizer|
lead_6_voice|synth_lead|Solista de voz sintetizada|Voice lead|48|96|synthesizer|
lead_7_fifths|synth_lead|Solista en quintas|Fifths lead|48|96|synthesizer|
lead_8_bass__lead|synth_bass|Bajo + solista|Bass + lead|28|84|synthesizer|
pad_1_new_age|synth_pad|Pad «new age»|New age pad|36|96|analog_synth|ambient
pad_2_warm|synth_pad|Pad cálido|Warm pad|36|96|analog_synth|ambient
pad_3_polysynth|synth_pad|Polisintetizador|Polysynth pad|36|96|analog_synth|ochentas
pad_4_choir|synth_pad|Pad de coro|Choir pad|36|96|choir|
pad_5_bowed|synth_pad|Pad frotado (con arco)|Bowed pad|36|96|analog_synth|
pad_6_metallic|synth_pad|Pad metálico|Metallic pad|36|96|analog_synth|
pad_7_halo|synth_pad|Pad «halo»|Halo pad|36|96|analog_synth|
pad_8_sweep|synth_pad|Pad de barrido|Sweep pad|36|96|analog_synth|
fx_1_rain|synth_fx|Lluvia sintetizada|Rain FX|36|96|eurorack|
fx_2_soundtrack|synth_fx|Banda sonora|Soundtrack FX|36|96|eurorack|cine
fx_3_crystal|synth_fx|Cristal|Crystal FX|36|96|eurorack|
fx_4_atmosphere|synth_fx|Atmósfera|Atmosphere FX|36|96|eurorack|ambient
fx_5_brightness|synth_fx|Brillo|Brightness FX|36|96|eurorack|
fx_6_goblins|synth_fx|Duendes|Goblins FX|36|96|eurorack|
fx_7_echoes|synth_fx|Ecos|Echoes FX|36|96|eurorack|
fx_8_scifi|synth_fx|Ciencia ficción|Sci-fi FX|36|96|eurorack|espacio
sitar|world|Sitar (India)|Sitar (India)|48|84|sitar|india indio bollywood
banjo|world|Banjo|Banjo|48|84|banjo|country bluegrass
shamisen|world|Shamisen (Japón)|Shamisen (Japan)|50|84|shamisen|japón japonés
koto|world|Koto (Japón)|Koto (Japan)|48|84|koto|japón japonés
kalimba|world|Kalimba|Kalimba|60|96|kalimba|áfrica mbira lofi
bagpipe|world|Gaita|Bagpipes|57|81|bagpipes|gaita escocesa gallega celta
fiddle|world|Violín folk (fiddle)|Fiddle|55|96|violin|folk irlandés country
shanai|world|Shehnai (India)|Shehnai (India)|60|91|oboe|india oboe
tinkle_bell|percussion|Cascabel afinado|Tinkle bell|72|108|glockenspiel|
agogo|percussion|Agogó|Agogo|60|84|congas|brasil samba
steel_drums|world|Steel drum (Caribe)|Steel drums (Caribbean)|52|88|steel_drum|caribe calipso trinidad
woodblock|percussion|Caja china|Woodblock|60|84|xylophone|madera
taiko_drum|percussion|Taiko (tambor japonés)|Taiko drum|36|60|taiko|japón
melodic_tom|percussion|Tom melódico|Melodic tom|36|72|drums|tom
synth_drum|percussion|Tambor sintetizado|Synth drum|36|72|synthesizer|syndrum disco
reverse_cymbal|fx|Platillo al revés|Reverse cymbal|48|72|drums|transición riser
guitar_fret_noise|fx|Ruido de trastes|Guitar fret noise|48|72|guitar|
breath_noise|fx|Respiración|Breath noise|48|72|flute|
seashore|fx|Olas del mar|Seashore|48|72|eurorack|mar playa
bird_tweet|fx|Pájaros|Bird tweet|60|96|eurorack|pájaro
telephone_ring|fx|Teléfono|Telephone ring|60|72|eurorack|
helicopter|fx|Helicóptero|Helicopter|48|72|eurorack|
applause|fx|Aplausos|Applause|48|72|choir|público
gunshot|fx|Disparo|Gunshot|48|72|eurorack|
"""
GM_STEP = 3  # una grabación cada 3 semitonos: como mucho se afina 1,5 semitonos


def _gm_items():
    out = []
    for line in GM.strip().splitlines():
        gm, cat, es, en, lo, hi, photo, tags = line.split("|")
        for set_id in ("fluid", "musyng", "fatboy"):
            out.append({"id": f"{gm.replace('__', '_')}_{set_id}", "gm": gm, "group": gm, "cat": cat, "es": es, "en": en,
                        "kind": "multi", "src": set_id, "range": [int(lo), int(hi)], "photo": photo,
                        "tags": tags + " general midi gm " + gm.replace("_", " ")})
    return out


# ---------------------------------------------------------------- VSCO 2 y VCSL (archivos en data/instrument-files.json)
# id | categoría | español | inglés | foto | grupo (variantes de un mismo instrumento) | etiquetas | fuente
SAMPLED = """
vsco_contrabass_arco|basses|Contrabajo solista: arco con vibrato|Solo double bass: bowed, vibrato|double_bass|vsco_contrabass|contrabajo orquesta|vsco2
vsco_contrabass_straight|basses|Contrabajo solista: arco sin vibrato|Solo double bass: bowed, straight|double_bass|vsco_contrabass|contrabajo|vsco2
vsco_contrabass_pizz|basses|Contrabajo solista: pizzicato|Solo double bass: pizzicato|double_bass|vsco_contrabass|contrabajo jazz walking|vsco2
vsco_contrabass_spic|basses|Contrabajo solista: spiccato|Solo double bass: spiccato|double_bass|vsco_contrabass|contrabajo corto|vsco2
vsco_contrabass_trem|basses|Contrabajo solista: trémolo|Solo double bass: tremolo|double_bass|vsco_contrabass|contrabajo suspense|vsco2
vsco_violin_arco|strings|Violín solista: arco|Solo violin: bowed|violin|vsco_violin|violín|vsco2
vsco_violin_pizz|strings|Violín solista: pizzicato|Solo violin: pizzicato|violin|vsco_violin|violín|vsco2
vsco_violin_spic|strings|Violín solista: spiccato|Solo violin: spiccato|violin|vsco_violin|violín|vsco2
vsco_violin_trem|strings|Violín solista: trémolo|Solo violin: tremolo|violin|vsco_violin|violín|vsco2
vsco_violins_arco|strings|Sección de violines: arco|Violin section: bowed|string_orchestra|vsco_violins|violines orquesta|vsco2
vsco_violins_pizz|strings|Sección de violines: pizzicato|Violin section: pizzicato|string_orchestra|vsco_violins|violines|vsco2
vsco_violins_spic|strings|Sección de violines: spiccato|Violin section: spiccato|string_orchestra|vsco_violins|violines|vsco2
vsco_violins_trem|strings|Sección de violines: trémolo|Violin section: tremolo|string_orchestra|vsco_violins|violines|vsco2
vsco_violas_arco|strings|Sección de violas: arco|Viola section: bowed|viola|vsco_violas|violas|vsco2
vsco_violas_pizz|strings|Sección de violas: pizzicato|Viola section: pizzicato|viola|vsco_violas|violas|vsco2
vsco_violas_spic|strings|Sección de violas: spiccato|Viola section: spiccato|viola|vsco_violas|violas|vsco2
vsco_violas_trem|strings|Sección de violas: trémolo|Viola section: tremolo|viola|vsco_violas|violas|vsco2
vsco_cellos_arco|strings|Sección de violonchelos: arco|Cello section: bowed|cello|vsco_cellos|chelos violonchelos|vsco2
vsco_cellos_pizz|strings|Sección de violonchelos: pizzicato|Cello section: pizzicato|cello|vsco_cellos|chelos|vsco2
vsco_cellos_spic|strings|Sección de violonchelos: spiccato|Cello section: spiccato|cello|vsco_cellos|chelos|vsco2
vsco_cellos_trem|strings|Sección de violonchelos: trémolo|Cello section: tremolo|cello|vsco_cellos|chelos|vsco2
vsco_harp|strings|Arpa de concierto (VSCO)|Concert harp (VSCO)|harp|vsco_harp|arpa|vsco2
vsco_horn|brass|Trompa|French horn|french_horn|vsco_horn|trompa corno|vsco2
vsco_horn_stac|brass|Trompa: staccato|French horn: staccato|french_horn|vsco_horn|trompa|vsco2
vsco_horn_muted|brass|Trompa con sordina|French horn: muted|french_horn|vsco_horn|trompa|vsco2
vsco_trumpet|brass|Trompeta (VSCO)|Trumpet (VSCO)|trumpet|vsco_trumpet|trompeta|vsco2
vsco_trumpet_vib|brass|Trompeta con vibrato|Trumpet: vibrato|trumpet|vsco_trumpet|trompeta|vsco2
vsco_trumpet_stac|brass|Trompeta: staccato|Trumpet: staccato|trumpet|vsco_trumpet|trompeta|vsco2
vsco_trumpet_harmon|brass|Trompeta con sordina harmon|Trumpet: harmon mute|trumpet|vsco_trumpet|trompeta miles davis|vsco2
vsco_trumpet_straight|brass|Trompeta con sordina recta|Trumpet: straight mute|trumpet|vsco_trumpet|trompeta|vsco2
vsco_trombone|brass|Trombón tenor|Tenor trombone|trombone|vsco_trombone|trombón|vsco2
vsco_trombone_vib|brass|Trombón tenor con vibrato|Tenor trombone: vibrato|trombone|vsco_trombone|trombón|vsco2
vsco_trombone_stac|brass|Trombón tenor: staccato|Tenor trombone: staccato|trombone|vsco_trombone|trombón|vsco2
vsco_oldtrombone|brass|Trombón antiguo|Vintage trombone|trombone|vsco_oldtrombone|trombón antiguo|vsco2
vsco_oldtrombone_buzz|brass|Trombón antiguo: «buzz»|Vintage trombone: buzz|trombone|vsco_oldtrombone|trombón|vsco2
vsco_tuba|brass|Tuba (VSCO)|Tuba (VSCO)|tuba|vsco_tuba|tuba|vsco2
vsco_tuba_stac|brass|Tuba: staccato|Tuba: staccato|tuba|vsco_tuba|tuba|vsco2
vsco_flute|woodwinds|Flauta travesera con vibrato|Flute: vibrato|flute|vsco_flute|flauta|vsco2
vsco_flute_straight|woodwinds|Flauta travesera sin vibrato|Flute: straight|flute|vsco_flute|flauta|vsco2
vsco_flute_stac|woodwinds|Flauta travesera: staccato|Flute: staccato|flute|vsco_flute|flauta|vsco2
vsco_piccolo|woodwinds|Flautín (VSCO)|Piccolo (VSCO)|flute|vsco_piccolo|flautín|vsco2
vsco_oboe|woodwinds|Oboe (VSCO)|Oboe (VSCO)|oboe|vsco_oboe|oboe|vsco2
vsco_oboe_stac|woodwinds|Oboe: staccato|Oboe: staccato|oboe|vsco_oboe|oboe|vsco2
vsco_clarinet|woodwinds|Clarinete (VSCO)|Clarinet (VSCO)|clarinet|vsco_clarinet|clarinete|vsco2
vsco_clarinet_stac|woodwinds|Clarinete: staccato|Clarinet: staccato|clarinet|vsco_clarinet|clarinete|vsco2
vsco_bassoon|woodwinds|Fagot (VSCO)|Bassoon (VSCO)|bassoon|vsco_bassoon|fagot|vsco2
vsco_bassoon_stac|woodwinds|Fagot: staccato|Bassoon: staccato|bassoon|vsco_bassoon|fagot|vsco2
vsco_upright|pianos|Piano vertical (Upright Nº 1)|Upright piano (Upright No. 1)|upright_piano|vsco_upright|piano pared vertical|vsco2
vsco_glockenspiel|mallets|Glockenspiel (VSCO)|Glockenspiel (VSCO)|glockenspiel|vsco_glockenspiel|carillón|vsco2
vsco_xylophone|mallets|Xilófono (VSCO)|Xylophone (VSCO)|xylophone|vsco_xylophone|xilófono|vsco2
vsco_marimba|mallets|Marimba (VSCO)|Marimba (VSCO)|marimba|vsco_marimba|marimba|vsco2
salamander_grand|pianos|Piano de cola Yamaha C5 (Salamander)|Yamaha C5 grand (Salamander)|piano|salamander_grand|yamaha c5 cola concierto|salamander
steinway_b|pianos|Piano de cola Steinway modelo B|Steinway Model B grand|piano|steinway_b|steinway cola concierto|vcsl
kawai_grand|pianos|Piano de cola Kawai|Kawai grand piano|piano|kawai_grand|kawai cola|vcsl
tx81z_piano|keys|Piano FM Yamaha TX81Z|Yamaha TX81Z piano|synthesizer|tx81z|fm ochentas|vcsl
tx81z_fmpiano|keys|Piano FM Yamaha TX81Z (2)|Yamaha TX81Z FM piano|synthesizer|tx81z|fm ochentas|vcsl
tx81z_clavisynth|keys|Clavisynth Yamaha TX81Z|Yamaha TX81Z clavisynth|clavinet|tx81z|fm ochentas|vcsl
concert_harp|strings|Arpa de concierto (VCSL)|Concert harp (VCSL)|harp|concert_harp|arpa|vcsl
folk_harp|world|Arpa celta|Folk harp (Celtic)|harp|folk_harp|arpa celta irlandesa|vcsl
dan_tranh|world|Đàn tranh (cítara de Vietnam)|Đàn tranh (Vietnamese zither)|dan_tranh|dan_tranh|vietnam cítara asia|vcsl
dan_tranh_trem|world|Đàn tranh: trémolo|Đàn tranh: tremolo|dan_tranh|dan_tranh|vietnam|vcsl
dan_tranh_vib|world|Đàn tranh: vibrato|Đàn tranh: vibrato|dan_tranh|dan_tranh|vietnam|vcsl
psaltery_pluck|early|Salterio punteado|Plucked psaltery|psaltery|psaltery|medieval salterio|vcsl
psaltery_bow|early|Salterio de arco|Bowed psaltery|psaltery|psaltery|medieval salterio|vcsl
psaltery_spic|early|Salterio: spiccato|Psaltery: spiccato|psaltery|psaltery|medieval|vcsl
strumstick|world|Strumstick (dulcémele de los Apalaches)|Strumstick (Appalachian dulcimer)|banjo|strumstick|folk apalaches|vcsl
recorder_soprano|early|Flauta dulce barroca soprano|Baroque soprano recorder|recorder|recorder_soprano|flauta dulce barroco|vcsl
recorder_soprano_stac|early|Flauta dulce soprano: staccato|Soprano recorder: staccato|recorder|recorder_soprano|flauta dulce|vcsl
recorder_alto|early|Flauta dulce barroca alto|Baroque alto recorder|recorder|recorder_alto|flauta dulce barroco|vcsl
recorder_alto_vib|early|Flauta dulce alto con vibrato|Alto recorder: vibrato|recorder|recorder_alto|flauta dulce|vcsl
recorder_alto_stac|early|Flauta dulce alto: staccato|Alto recorder: staccato|recorder|recorder_alto|flauta dulce|vcsl
recorder_tenor|early|Flauta dulce barroca tenor|Baroque tenor recorder|recorder|recorder_tenor|flauta dulce barroco|vcsl
recorder_tenor_vib|early|Flauta dulce tenor con vibrato|Tenor recorder: vibrato|recorder|recorder_tenor|flauta dulce|vcsl
recorder_tenor_stac|early|Flauta dulce tenor: staccato|Tenor recorder: staccato|recorder|recorder_tenor|flauta dulce|vcsl
recorder_bass|early|Flauta dulce barroca bajo|Baroque bass recorder|recorder|recorder_bass|flauta dulce barroco|vcsl
recorder_bass_vib|early|Flauta dulce bajo con vibrato|Bass recorder: vibrato|recorder|recorder_bass|flauta dulce|vcsl
recorder_bass_stac|early|Flauta dulce bajo: staccato|Bass recorder: staccato|recorder|recorder_bass|flauta dulce|vcsl
ocarina_vcsl|woodwinds|Ocarina de 12 agujeros|12-hole ocarina|ocarina|ocarina_vcsl|ocarina zelda|vcsl
ocarina_vcsl_vib|woodwinds|Ocarina con vibrato|Ocarina: vibrato|ocarina|ocarina_vcsl|ocarina|vcsl
ocarina_small|woodwinds|Ocarina pequeña|Small ocarina|ocarina|ocarina_small|ocarina|vcsl
ocarina_small_stac|woodwinds|Ocarina pequeña: staccato|Small ocarina: staccato|ocarina|ocarina_small|ocarina|vcsl
pipe_organ_loud|organs|Órgano de tubos (registro fuerte)|Pipe organ (loud stop)|pipe_organ|pipe_organ|iglesia catedral tubos|vcsl
pipe_organ_soft|organs|Órgano de tubos (registro suave)|Pipe organ (quiet stop)|pipe_organ|pipe_organ|iglesia tubos|vcsl
pipe_organ_pedal|organs|Órgano de tubos: pedal|Pipe organ: pedal|pipe_organ|pipe_organ|bajo pedal|vcsl
pipe_organ_pedal_soft|organs|Órgano de tubos: pedal suave|Pipe organ: quiet pedal|pipe_organ|pipe_organ|pedal|vcsl
renaissance_organ_8|early|Órgano renacentista (8')|Renaissance organ (8')|pipe_organ|renaissance_organ|renacimiento positivo|vcsl
renaissance_organ_4|early|Órgano renacentista (4')|Renaissance organ (4')|pipe_organ|renaissance_organ|renacimiento|vcsl
renaissance_organ_full|early|Órgano renacentista (lleno)|Renaissance organ (full)|pipe_organ|renaissance_organ|renacimiento|vcsl
hohner_special20|organs|Armónica Hohner Special 20|Hohner Special 20 harmonica|harmonica|hohner_special20|armónica blues diatónica|vcsl
hohner_special20_soft|organs|Armónica Special 20 (suave)|Special 20 harmonica (soft)|harmonica|hohner_special20|armónica|vcsl
hohner_special20_vib|organs|Armónica Special 20 (vibrato)|Special 20 harmonica (vibrato)|harmonica|hohner_special20|armónica|vcsl
hohner_super64|organs|Armónica cromática Hohner Super 64|Hohner Super 64 chromatic harmonica|harmonica|hohner_super64|armónica cromática stevie wonder|vcsl
hohner_super64_acc|organs|Armónica Super 64 (acentos)|Super 64 harmonica (accented)|harmonica|hohner_super64|armónica|vcsl
hohner_super64_vib|organs|Armónica Super 64 (vibrato)|Super 64 harmonica (vibrato)|harmonica|hohner_super64|armónica|vcsl
tenor_sax_vcsl|woodwinds|Saxo tenor (VCSL)|Tenor sax (VCSL)|sax|tenor_sax_vcsl|saxo|vcsl
tenor_sax_vcsl_vib|woodwinds|Saxo tenor con vibrato|Tenor sax: vibrato|sax|tenor_sax_vcsl|saxo|vcsl
tenor_sax_vcsl_stac|woodwinds|Saxo tenor: staccato|Tenor sax: staccato|sax|tenor_sax_vcsl|saxo|vcsl
saxello|woodwinds|Saxello (saxo soprano curvo)|Saxello (curved soprano sax)|saxophone_soprano|saxello|saxo|vcsl
saxello_vib|woodwinds|Saxello con vibrato|Saxello: vibrato|saxophone_soprano|saxello|saxo|vcsl
saxello_stac|woodwinds|Saxello: staccato|Saxello: staccato|saxophone_soprano|saxello|saxo|vcsl
wine_glass|mallets|Copas de cristal|Wine glasses|eurorack|wine_glass|copa cristal|vcsl
wine_glass_slow|mallets|Copas de cristal (lentas)|Wine glasses (slow)|eurorack|wine_glass|copa|vcsl
balafon|world|Balafón (África occidental)|Balafon (West Africa)|xylophone|balafon|áfrica xilófono|vcsl
balafon_hard|world|Balafón: baqueta dura|Balafon: hard mallet|xylophone|balafon|áfrica|vcsl
balafon_soft|world|Balafón: baqueta blanda|Balafon: soft mallet|xylophone|balafon|áfrica|vcsl
bell_tree|mallets|Árbol de campanas|Bell tree|tubular_bells|bell_tree|campanas|vcsl
glockenspiel_vcsl|mallets|Glockenspiel (VCSL)|Glockenspiel (VCSL)|glockenspiel|glockenspiel_vcsl|carillón|vcsl
hand_chimes|mallets|Campanas de mano|Hand chimes|tubular_bells|hand_chimes|campanas|vcsl
mbira_kenya|world|Kalimba de Kenia|Kenyan kalimba|kalimba|mbira|áfrica kalimba mbira|vcsl
mbira_tanzania|world|Kalimba de Tanzania|Tanzanian kalimba|kalimba|mbira|áfrica kalimba|vcsl
mbira_gandanga|world|Mbira mavembe (Zimbabue)|Mbira mavembe (Zimbabwe)|kalimba|mbira|áfrica zimbabue|vcsl
mbira_nyamaropa|world|Mbira dzaVadzimu (Zimbabue)|Mbira dzaVadzimu (Zimbabwe)|kalimba|mbira|áfrica|vcsl
nyunga_nyunga|world|Nyunga nyunga (Mozambique)|Nyunga nyunga (Mozambique)|kalimba|mbira|áfrica|vcsl
marimba_vcsl|mallets|Marimba (VCSL)|Marimba (VCSL)|marimba|marimba_vcsl|marimba|vcsl
tubular_bells_vcsl|mallets|Campanas tubulares (VCSL)|Tubular bells (VCSL)|tubular_bells|tubular_bells_vcsl|campanas|vcsl
tubular_bells_vcsl2|mallets|Campanas tubulares 2 (VCSL)|Tubular bells 2 (VCSL)|tubular_bells|tubular_bells_vcsl|campanas|vcsl
vibraphone_hard|mallets|Vibráfono: baquetas duras|Vibraphone: hard mallets|vibraphone|vibraphone_vcsl|vibráfono jazz|vcsl
vibraphone_soft|mallets|Vibráfono: baquetas blandas|Vibraphone: soft mallets|vibraphone|vibraphone_vcsl|vibráfono|vcsl
vibraphone_bowed|mallets|Vibráfono con arco|Vibraphone: bowed|vibraphone|vibraphone_vcsl|vibráfono ambient|vcsl
xylophone_vcsl|mallets|Xilófono (VCSL)|Xylophone (VCSL)|xylophone|xylophone_vcsl|xilófono|vcsl
xylophone_vcsl_soft|mallets|Xilófono: baquetas blandas|Xylophone: soft mallets|xylophone|xylophone_vcsl|xilófono|vcsl
xylophone_vcsl_hard|mallets|Xilófono: baquetas duras|Xylophone: hard mallets|xylophone|xylophone_vcsl|xilófono|vcsl
bongos|percussion|Bongós|Bongos|congas|bongos|latino salsa|vcsl
congas|percussion|Congas|Congas|congas|congas|latino salsa cuba|vcsl
darbuka|percussion|Darbuka|Darbuka|tabla|darbuka|árabe oriente|vcsl
frame_drum|percussion|Pandero (frame drum)|Frame drum|tabla|frame_drum|pandero bendir|vcsl
cajon|percussion|Cajón|Cajón|cajon|cajon|flamenco perú|vcsl
timpani_vcsl|percussion|Timbales de orquesta (golpes)|Timpani hits|timpani|timpani_vcsl|orquesta|vcsl
timpani_roll|percussion|Redoble de timbal|Timpani roll|timpani|timpani_vcsl|redoble|vcsl
concert_bass_drum|percussion|Bombo de orquesta|Concert bass drum|timpani|concert_bass_drum|bombo orquesta|vcsl
snare_modern|percussion|Caja moderna|Modern snare|drums|snare_modern|caja|vcsl
rope_snare|percussion|Caja de cuerdas (antigua)|Rope-tension snare|drums|rope_snare|caja militar|vcsl
concert_tom_hi|percussion|Tom de concierto agudo|Concert tom (high)|drums|concert_tom|tom|vcsl
concert_tom_lo|percussion|Tom de concierto grave|Concert tom (low)|drums|concert_tom|tom|vcsl
agogo_vcsl|percussion|Agogó (VCSL)|Agogo (VCSL)|congas|agogo_vcsl|brasil|vcsl
anvil|percussion|Yunque|Anvil|eurorack|anvil|metal|vcsl
brake_drum|percussion|Tambor de freno|Brake drum|eurorack|brake_drum|metal|vcsl
cabasa|percussion|Cabasa|Cabasa|congas|cabasa|latino|vcsl
claps_vcsl|percussion|Palmas|Hand claps|drums|claps_vcsl|palmas flamenco|vcsl
clash_cymbals|percussion|Platillos de choque|Clash cymbals|drums|clash_cymbals|platillos orquesta|vcsl
claves|percussion|Claves|Claves|congas|claves|clave latino|vcsl
cowbells|percussion|Cencerros|Cowbells|congas|cowbells|cencerro|vcsl
flexatone|percussion|Flexatón|Flexatone|eurorack|flexatone|dibujos|vcsl
gong|percussion|Gong|Gong|tubular_bells|gong|gong|vcsl
gong_tam|percussion|Tam-tam|Tam-tam|tubular_bells|gong|gong|vcsl
guiro|percussion|Güiro|Güiro|congas|guiro|latino|vcsl
nepalese_bells|percussion|Campanas nepalíes|Nepalese hand bells|tubular_bells|nepalese_bells|campanas|vcsl
hihat_vcsl|percussion|Hi-hat (VCSL)|Hi-hat (VCSL)|drums|hihat_vcsl|charles|vcsl
mark_trees|percussion|Mark tree (cortina de campanitas)|Mark tree|tubular_bells|mark_trees|campanitas|vcsl
ocean_drum|percussion|Tambor de olas|Ocean drum|tabla|ocean_drum|mar|vcsl
ratchet|percussion|Carraca|Ratchet|eurorack|ratchet|carraca|vcsl
shaker_large|percussion|Shaker grande|Large shaker|congas|shaker|maraca|vcsl
shaker_small|percussion|Shaker pequeño|Small shaker|congas|shaker|maraca|vcsl
slapstick|percussion|Látigo (slapstick)|Slapstick|eurorack|slapstick|látigo|vcsl
sleigh_bells|percussion|Cascabeles de trineo|Sleigh bells|glockenspiel|sleigh_bells|navidad cascabeles|vcsl
slit_drum|percussion|Tambor de hendidura|Slit drum|xylophone|slit_drum|madera|vcsl
suspended_cymbal|percussion|Platillo suspendido|Suspended cymbal|drums|suspended_cymbal|platillo|vcsl
tambourine_vcsl|percussion|Pandereta|Tambourine|congas|tambourine_vcsl|pandereta|vcsl
triangles|percussion|Triángulos|Triangles|glockenspiel|triangles|triángulo|vcsl
vibraslap|percussion|Vibraslap|Vibraslap|congas|vibraslap|quijada|vcsl
woodblock_vcsl|percussion|Caja china (VCSL)|Woodblock (VCSL)|xylophone|woodblock_vcsl|madera|vcsl
didgeridoo|world|Didgeridoo (Australia)|Didgeridoo (Australia)|didgeridoo|didgeridoo|australia aborigen|vcsl
train_whistle|fx|Silbato de tren|Train whistle|eurorack|whistles|tren|vcsl
siren_whistle|fx|Sirena de silbato|Siren whistle|eurorack|whistles|sirena|vcsl
ball_whistle|fx|Silbato de árbitro|Ball whistle|eurorack|whistles|silbato carnaval|vcsl
finger_cymbal|percussion|Crótalos|Finger cymbal|glockenspiel|finger_cymbal|crótalos danza|vcsl
"""

# ---------------------------------------------------------------- sintetizadores (no se descargan)
# id (= s "…") | categoría | español | inglés | extra de código | etiquetas | fuente | voz para escuchar en el navegador
SYNTHS = """
superpiano|pianos|Piano sintetizado (superpiano)|Synth piano (superpiano)||piano|superdirt|piano
supersaw|synth_pad|Supersaw (pared de dientes de sierra)|Supersaw (wall of saws)| # voice 0.3 # lpf 3000|trance edm|superdirt|sawtooth
superhoover|synth_lead|Hoover (rave de los 90)|Hoover (90s rave)||rave techno|superdirt|sawtooth
supersquare|synth_lead|Onda cuadrada|Square wave| # lpf 2500|chiptune|superdirt|square
superpwm|synth_bass|Ancho de pulso (PWM)|Pulse width (PWM)| # lpf 900|bajo|superdirt|sawtooth
supercomparator|synth_lead|Comparador|Comparator||ácido|superdirt|square
superchip|synth_lead|Chip de 8 bits|8-bit chip||chiptune gameboy nintendo|superdirt|square
superfm|synth_keys|FM de 6 operadores|6-operator FM||dx7 fm|superdirt|sine
superhammond|organs|Órgano Hammond sintetizado|Synth Hammond organ| # voice 3|hammond gospel|superdirt|square
supervibe|mallets|Vibráfono sintetizado|Synth vibraphone||vibes|superdirt|sine
superfork|mallets|Diapasón (campanita FM)|Tuning fork (FM bell)||campana|superdirt|sine
supergong|percussion|Gong sintetizado|Synth gong|| |superdirt|sine
superzow|synth_lead|Zow (sierra con fase)|Zow (phased saw)||trance|superdirt|sawtooth
superstatic|synth_fx|Estática (ruido)|Static (noise)||ruido|superdirt|sawtooth
supermandolin|world|Mandolina sintetizada|Synth mandolin||mandolina|superdirt|triangle
superreese|synth_bass|Bajo Reese (drum and bass)|Reese bass (drum and bass)| # lpf 1200|dnb jungle|superdirt|sawtooth
supersiren|synth_fx|Sirena|Siren||sirena|superdirt|sine
supertron|synth_lead|Tron (tipo Mellotron)|Tron (Mellotron style)||mellotron|superdirt|sawtooth
supertrumpet|brass|Trompeta sintetizada|Synth trumpet||trompeta|studio|brass
super808|synth_bass|Bajo 808 sintetizado|Synth 808 bass||808 trap hip hop|superdirt|sine
superkick|percussion|Bombo sintetizado|Synth kick||bombo|superdirt|sine
supersnare|percussion|Caja sintetizada|Synth snare||caja|superdirt|sawtooth
superhat|percussion|Hi-hat sintetizado|Synth hi-hat||charles|superdirt|sawtooth
superclap|percussion|Palmas sintetizadas|Synth clap||palmas|superdirt|sawtooth
superhex|synth_lead|Hex (onda con fases)|Hex (phased wave)||techno|superdirt|square
superprimes|synth_fx|Primos (armónicos raros)|Primes (odd harmonics)||experimental|superdirt|sine
supergrind|synth_fx|Grind (distorsión)|Grind (distortion)||industrial|superdirt|sawtooth
superwavemechanics|synth_fx|Wave mechanics|Wave mechanics||experimental|superdirt|sine
supernoise|synth_fx|Ruido (supernoise)|Noise (supernoise)||ruido|superdirt|sawtooth
ts_rhodes|keys|Piano eléctrico FM (Tidal Studio)|FM electric piano (Tidal Studio)||rhodes soul|studio|sine
ts_organ|organs|Órgano de barras (Tidal Studio)|Drawbar organ (Tidal Studio)||hammond|studio|square
ts_pluck|synth_keys|Pluck de cuerda (Karplus-Strong)|String pluck (Karplus-Strong)||guitarra harpa|studio|triangle
ts_strings|synth_pad|Cuerdas analógicas (Solina)|Analog strings (Solina)||solina ochentas|studio|sawtooth
ts_pad|synth_pad|Pad cálido con chorus|Warm chorus pad||ambient|studio|sawtooth
ts_brass|synth_keys|Metales analógicos|Analog brass||ochentas|studio|sawtooth
ts_bell|mallets|Campana FM|FM bell||campana navidad|studio|sine
ts_acid|synth_bass|Bajo ácido (estilo TB-303)|Acid bass (TB-303 style)| # cutoff 900 # resonance 0.7|acid house techno 303|studio|sawtooth
ts_sub|synth_bass|Sub-bajo (808)|Sub bass (808)||808 trap|studio|sine
ts_wobble|synth_bass|Bajo wobble (dubstep)|Wobble bass (dubstep)||dubstep|studio|sawtooth
ts_choir|voices|Coro sintetizado (formantes)|Formant synth choir||coro voces|studio|sine
ts_juno|synth_pad|Pad «Juno» (pulso con chorus)|Juno-style pad||juno ochentas|studio|square
ts_lead|synth_lead|Solista analógico (tipo Minimoog)|Analog lead (Minimoog style)||moog solo|studio|sawtooth
ts_marimba|mallets|Marimba modal (sintetizada)|Modal marimba (synth)||marimba|studio|sine
ts_flute|woodwinds|Flauta sintetizada|Synth flute||flauta|studio|sine
"""

# ---------------------------------------------------------------- motores con plugins
# Plaits (Mutable Instruments) tiene 16 motores; cada uno es un instrumento distinto
PLAITS = [
    ("Analógico virtual (dos osciladores)", "Virtual analog (two oscillators)", "synth_lead"),
    ("Moldeador de onda", "Waveshaper", "synth_lead"),
    ("FM de dos operadores", "Two-operator FM", "synth_keys"),
    ("Formantes granulares", "Granular formants", "synth_fx"),
    ("Aditivo (armónicos)", "Additive (harmonics)", "synth_keys"),
    ("Tabla de ondas", "Wavetable", "synth_pad"),
    ("Acordes (cuerdas y órgano)", "Chords (strings & organ)", "synth_pad"),
    ("Voz que habla", "Speech", "synth_fx"),
    ("Enjambre de sierras", "Swarm of saws", "synth_pad"),
    ("Ruido filtrado", "Filtered noise", "synth_fx"),
    ("Partículas", "Particle noise", "synth_fx"),
    ("Cuerda punteada", "Plucked string", "synth_keys"),
    ("Modal (campanas, láminas)", "Modal (bells, bars)", "mallets"),
    ("Bombo analógico", "Analog kick", "percussion"),
    ("Caja analógica", "Analog snare", "percussion"),
    ("Hi-hat analógico", "Analog hi-hat", "percussion"),
]
RINGS = [
    ("Resonador modal", "Modal resonator"), ("Cuerdas simpáticas", "Sympathetic strings"),
    ("Cuerda", "String"), ("Voz FM", "FM voice"), ("Cuerdas simpáticas afinadas", "Quantized sympathetic strings"),
    ("Cuerda con reverb", "String and reverb"),
]
BRAIDS = [(0, "CSAW", "Sierra con muesca", "Notched saw"), (5, "SYNC", "Sincronía dura", "Hard sync"),
          (10, "SAW SWARM", "Enjambre de sierras", "Saw swarm"), (14, "TOY", "Juguete (8 bits)", "Toy (8-bit)"),
          (16, "VOSIM", "Formantes VOSIM", "VOSIM formants"), (18, "VOWEL", "Vocales", "Vowels"),
          (23, "FM", "FM", "FM"), (28, "PLUCK", "Cuerda punteada", "Plucked string"), (29, "BOWED", "Cuerda frotada", "Bowed string"),
          (30, "BLOWN", "Soplido (flauta)", "Blown (flute)"), (31, "FLUTED", "Flautado", "Fluted"), (32, "BELL", "Campana", "Bell"),
          (33, "DRUM", "Tambor metálico", "Metallic drum"), (36, "CYMBAL", "Platillo", "Cymbal"),
          (38, "WTBL", "Tabla de ondas", "Wavetable"), (42, "QPSK", "Datos (QPSK)", "Data (QPSK)")]


def _engine_items():
    out = []
    for i, (es, en, cat) in enumerate(PLAITS):
        out.append({"id": f"plaits_{i}", "sound": "plaits", "extra": f" # engine {i}", "cat": cat, "es": f"Plaits: {es}",
                    "en": f"Plaits: {en}", "kind": "engine", "engine": "mi", "src": "mi", "group": "plaits",
                    "photo": "eurorack", "tags": "mutable instruments plaits eurorack modular", "voice": "sawtooth"})
    for i, (es, en) in enumerate(RINGS):
        out.append({"id": f"rings_{i}", "sound": "rings", "extra": f" # engine {i}", "cat": "synth_keys" if i != 1 else "synth_pad",
                    "es": f"Rings: {es}", "en": f"Rings: {en}", "kind": "engine", "engine": "mi", "src": "mi", "group": "rings",
                    "photo": "eurorack", "tags": "mutable instruments rings resonador eurorack", "voice": "triangle"})
    for n, code, es, en in BRAIDS:
        out.append({"id": f"braids_{n}", "sound": "braids", "extra": f" # engine {n}", "cat": "synth_lead" if n < 28 else "synth_keys",
                    "es": f"Braids {code}: {es}", "en": f"Braids {code}: {en}", "kind": "engine", "engine": "mi", "src": "mi",
                    "group": "braids", "photo": "eurorack", "tags": "mutable instruments braids eurorack", "voice": "square"})
    out.append({"id": "vital", "sound": "vital", "extra": "", "cat": "engines", "es": "Vital (synth de tablas de ondas)",
                "en": "Vital (wavetable synth)", "kind": "engine", "engine": "vital", "src": "vital", "group": "vital",
                "photo": "analog_synth", "tags": "vital wavetable vst serum", "voice": "sawtooth"})
    out.append({"id": "surge", "sound": "surge", "extra": "", "cat": "engines", "es": "Surge XT (sonido de inicio)",
                "en": "Surge XT (init sound)", "kind": "engine", "engine": "surge", "src": "surge", "group": "surge",
                "photo": "analog_synth", "tags": "surge xt vst", "voice": "sawtooth"})
    return out


def _sampled_items():
    out = []
    for line in SAMPLED.strip().splitlines():
        iid, cat, es, en, photo, group, tags, src = line.split("|")
        out.append({"id": iid, "cat": cat, "es": es, "en": en, "kind": "multi", "src": src, "photo": photo,
                    "group": group, "tags": tags})
    return out


def _synth_items():
    out = []
    for line in SYNTHS.strip().splitlines():
        sid, cat, es, en, extra, tags, src, voice = line.split("|")
        out.append({"id": sid, "sound": sid, "extra": extra, "cat": cat, "es": es, "en": en, "kind": "synth", "src": src,
                    "photo": dict(CAT_PHOTO).get(cat, "synthesizer"), "group": sid, "tags": tags, "voice": voice})
    return out


CAT_PHOTO = [(c[0], c[3]) for c in CATEGORIES]


def build():
    items = _gm_items() + _sampled_items() + _synth_items() + _engine_items()
    return items


ITEMS = build()
BY_ID = {i["id"]: i for i in ITEMS}

# Palabras en español/inglés que no salen en los nombres (para el buscador y para Maestro)
SYNONYMS = {   # palabra en español → frases en inglés separadas por comas (cada frase tiene que aparecer entera)
    "clavicordio": "harpsichord, clavecín", "clavicembalo": "harpsichord", "clave": "harpsichord", "chelo": "cello, violonchelo",
    "contrabajo": "double bass, contrabass", "violonchelo": "cello", "fagot": "bassoon", "trompa": "horn", "gaita": "bagpipe",
    "zampoña": "pan flute", "órgano": "organ", "organo": "organ", "rhodes": "electric piano", "wurlitzer": "electric piano",
    "hammond": "drawbar organ", "moog": "lead, synth bass", "orquesta": "strings, ensemble", "cuerdas": "strings",
    "metales": "brass", "vientos": "woodwinds", "coro": "choir", "voz": "voice, choir", "arpa": "harp", "flauta": "flute, recorder",
    "guitarra": "guitar", "bajo": "bass", "batería": "drum, percussion", "percusión": "percussion", "campanas": "bells",
    "xilófono": "xylophone", "vibráfono": "vibraphone", "piano": "piano", "steinway": "steinway", "yamaha": "yamaha",
    "barroco": "harpsichord, recorder, baroque, early", "medieval": "psaltery, recorder, early", "japonés": "koto, shamisen, shakuhachi, taiko",
    "india": "sitar, shehnai, tabla", "áfrica": "kalimba, mbira, balafon", "africano": "kalimba, mbira, balafon",
    "latino": "conga, bongo, claves, guiro", "flamenco": "nylon guitar, cajon, claps", "jazz": "upright bass, vibraphone, sax, electric piano",
}
