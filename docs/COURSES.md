# Genre courses · build a song from scratch

**English** · Spanish text lives in the app itself (switch with the ES/EN button).

Open **Genre courses** in the top bar. Each course builds one complete song in one genre, the way a production class
would: the signature rhythm first, then bass, harmony, melody, arrangement (16 bars, written as `mask`) and mix
(the Mix tab's dB and EQ). Every step adds tracks that already sound good, Maestro explains the musical *why* and the
code piece by piece, and each step ends with a small challenge. «Hear the result» on each course card plays the
finished song for a few bars before you start.

## Latin courses follow your composition plugin

The five Latin courses (merengue, salsa, cumbia, reggaeton, bossa nova) were rewritten in version 0.9 with the Latin
style skills of the [music-composition plugin](https://github.com/vsalesa/music-composition-skills)
(`mc-style-latin-merengue`, `-salsa`, `-cumbia`, `-reggaeton`, `-bossa-mpb`):

- **A named tradition first.** Each course says which branch and era it plays (1980s orchestral merengue, 1970s New York
  salsa dura on a 2-3 son clave, Mexican accordion cumbia, today's melodic reggaeton, classic Rio bossa nova) and which
  artist it uses as a lens, as the skills ask, instead of a generic «Latin» groove.
- **The skill's rule on every step.** Each step shows «What the skill says»: the rule from the skill that the step puts
  into practice (interlocking parts, clave direction, coro and pregón with different jobs, the bossa «early chord» on even
  bars, shortening the sub when it collides with the kick, a hook that comes back changed, a real density drop…).
- **Maestro loads the same skill.** While you are in a Latin course, «Ask Maestro» always loads that course's skill.
- **Real instruments.** The parts use the instrument library instead of generic synths: güiro, congas, bongos, claves,
  cowbell, wood block, shaker and timbal (VCSL, CC0) and upright and electric bass, bright piano, trumpet, trombone, alto
  sax, choir, organ, accordion, nylon guitar, flute and pad (FluidR3 GM, CC BY 3.0). They download by themselves the first
  time you start the course (about 25 MB in total); if a download fails, the studio tells you which one.
- **New musical content.** The salsa now has a bongo martillo that switches to the bell in the montuno, a piano guajeo in
  octaves, a coro answering a trombone moña, and a five-part form; the merengue has bass approach notes and trumpet/sax
  call and response with a jaleo break; the cumbia has a 1-5-5 bass matched by the kick and an 8-bar accordion hook with a
  varied answer; the reggaeton has a dembow fill, a short sub, chopped vocals and a subtractive break; the bossa follows
  the odd/even bar chord rule and plans a density drop.

## Real drummer examples (0.10)

Nine courses carry a `ref`: one performance from the [Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove)
(Google Magenta, CC BY 4.0), real drummers recorded on an electronic kit. `server/references.py` downloads the dataset's
MIDI pack once, takes the bars the course names and writes one Tidal track per part of the kit (kick, snare and rim,
hi-hats, toms and cymbals, on d9 to d12). Each hit keeps its velocity as `gain` and its distance from the grid as `nudge`
(seconds, with the shared offset of the recording removed). Swing is written on a 12-step triplet grid. `sounds` swaps
kit pieces for the course's instruments (merengue: wood block and congas for the tambora; reggaeton: an 808 kick) and
`slow` stretches the songo bar over two salsa bars.

| Course | Example | What it teaches |
|---|---|---|
| Merengue | Dominican merengue, 130 BPM | the tambora on a kit: rim on the 4th, 7th and 11th sixteenth, a tom roll into the next bar |
| Salsa | Cuban songo, 112 BPM | a kick that anticipates like the tumbao, ghost notes around the rim |
| Reggaeton | Reggaeton, 90 BPM | off-beat hi-hat accents and a dembow about 15 ms ahead of the grid |
| Bossa nova | Bossa nova, 127 BPM | surdo kick, rim clave that changes every bar, everything soft |
| Jazz | Swing, 124 BPM | triplet ride feel, hi-hat foot on 2 and 4 |
| Funk | Funk, 102 BPM | ghost notes between the backbeats, open hats on the last sixteenth |
| House | Disco, 120 BPM | the four-on-the-floor drummers that house machines copied |
| Drum & bass | Breakbeat, 170 BPM | a whole break played before you chop one |
| Lo-fi | Hip hop, 86 BPM | a fixed backbeat with the kick and the timing moving around it |

Cumbia and techno have no example: the dataset has no cumbia or techno, and no openly licensed MIDI for them was found.
What the reggaeton drummer does (hi-hats loud on the «and», dembow early) was measured over all 32 bars and copied into
the course's own dembow step. All 32 example tracks were compiled and queried with tidal-core 1.10.0.

## Style profiles learned from real songs (0.10)

`tools/learn_style.py GENRE files-or-folders` measures MIDI songs on a 16-step grid and writes one profile per genre to
`server/data/style_profiles.json`: per role (bass, keys, guitar, brass, sax) the % of bars with a hit on each sixteenth
and the three most common rhythms, the chord degree the bass plays at each common step, every General MIDI percussion
instrument's pattern, and the most repeated four-chord progressions. Maestro gets the profile of the course's genre.

| Genre | Songs | What the data said | Change to the course |
|---|---|---|---|
| Merengue | 3 | bass on 1, «and» of 2, 3, 4, «and» of 4 (root, fifth, approach); piano on every eighth (over 90%) with sixteenth pickups, 1.6 notes per hit; low conga on the «and» of 2 and 4 (over 70%) | bass, piano and tambora rewritten |
| Salsa | 7 | bass anticipates: «and» of 2 and beat 4; i–iv–V–i is the most repeated progression | none, the tumbao already matched |
| Cumbia | 9 | bass on 1, 3 and 4; güiro on three of every four sixteenths | none, already matched |
| Bossa nova | 12 | bass on 1, «and» of 2, 3, «and» of 4 (dotted quarter + eighth) | none, already matched |
| Reggaeton | 1 drummer | off-beat hi-hat accents, dembow about 15 ms early | hi-hats and snare timing |

## How the code was checked

- Every track in every course (70 tracks) was compiled and evaluated with the real TidalCycles
  pattern library (tidal-core 1.10.0): it type-checks, the mini-notation parses, and it produces events.
- The 34 tracks of the Latin courses were checked again for 0.9 the same way, and their notes were read back from
  Tidal to confirm the chord tones, anticipations and ranges of each real instrument. Every instrument name exists in
  the instrument library catalog, and the kit indices (for example `congas:12` quinto, `congas:22` tumba, `bongos:16`
  open low bongo, `cowbells:11` open bell) were checked against the downloaded files.
- Every sample name and index exists in [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) (for example
  `drumtraks:0` is a cabasa, `808:2` claves, `808:4` maracas, `808hc/808mc/808lc` congas, `drumtraks:7` a ride).
  Pitched parts use the studio's synths (superpiano, superpwm, supersaw, superhammond, supertrumpet, supersquare,
  sawtooth, triangle) or the `gtr` sample pitched with `note`.
- The code in the challenges was compiled the same way.

## Courses

| Course | Origin | BPM | Key / progression | Steps | You learn |
|---|---|---|---|---|---|
| Merengue | Dominican Republic | 140 | C major · I–IV–V7–I | The güira: the engine → Tambora and kick → The bass that jumps ahead → Off-beat piano → Horns: call and response → Arrangement: launch, merengue, mambo and jaleo → Mix: let everything be heard | Güira and tambora, Bass with approach notes, Horn call and response |
| Salsa | Cuba · Puerto Rico · New York | 180 | A minor · i–iv–V7–iv | The 2-3 clave → Congas and bongo → The bass tumbao → The piano guajeo → Montuno: coro and bell → The trombone moña → Arrangement: intro, tema, montuno, mambo and ending → Orchestra mix | 2-3 clave, Tumbao and guajeo, Coro and moña |
| Cumbia | Colombia · Mexico | 96 | A minor · i–iv–V7–i | The güiro → Congas, kick and timbal → 1-5-5 bass → The off-beat organ → The accordion: a hook that comes back changed → Arrangement: opening, cumbia, interlude and return → Mix | «Cha-chi-ki» güiro, 1-5-5 bass, A hook that comes back changed |
| Reggaeton | Puerto Rico · Panama | 92 | A minor · i–VI–III–VII | The kick → The dembow (with variation) → 808 sub in tresillo (without clashing) → Chord pad → The guitar hook → Chopped vocals: the hook in another rhythm → Arrangement: hook, verse, break and return → Mix | Dembow with variations, A sub that doesn't clash, Break and return |
| Bossa nova | Brazil | 130 | C major · Imaj7–vi7–ii7–V7 | Sixteenth-note shaker → Surdo and rimshot → Upright bass → The batida: the early chord → The flute: first time and variation → Arrangement: solo guitar, band, intimate moment → Intimate mix | Guitar batida, The early chord, Dropping the density |
| Jazz (swing) | United States | 140 | C major · ii–V–I–VI | The ride and swing → Hi-hat on 2 and 4 → Walking bass → Charleston piano → The head: muted trumpet → Arrangement: intro, head, ending → Jazz club mix | Swing, Walking bass, ii–V–I |
| Funk | United States | 104 | E dorian · Em7–A7 | Syncopated kick → Snare with ghost notes and hi-hats → Octave-jumping bass → Scratchy guitar → Horn stabs → Arrangement → Mix | Ghost notes, Sixteenth notes, Two-chord vamp |
| House | Chicago | 124 | A minor · im7–VImaj7–ivm7–vm7 | Four-on-the-floor → Claps and hi-hats → Off-beat bass → Piano chords → Filtered arpeggio → DJ arrangement → Club mix | Four-on-the-floor, Arpeggios, Filter modulation |
| Techno | Detroit · Berlin | 130 | A minor (a single chord) | The kick → Hats and claps → Euclidean percussion → Rolling bass → Acid line → Dark pad → Arrangement with a breakdown → Warehouse mix | Euclidean rhythms, Cut groups, Acid line |
| Drum & bass | United Kingdom | 174 | D minor · i–VI–III–VII | The two-step → Hats and break → Long bass → Pad → Liquid piano → Arrangement: intro and drop → Mix | Two-step, Breakbeat, Randomness |
| Lo-fi hip hop | The internet | 80 | C major · IVmaj7–iii7–ii7–Imaj7 | Boom-bap drums → Swung hi-hats → Piano chords → Soft bass → A melody that comes and goes → Arrangement → Old-tape mix | Swing, Boom-bap, Random variation |

## Sources and licensing

The rhythms taught here are traditional patterns (güira and tambora cells, son clave, tumbao, dembow, bossa surdo and
rim, swing ride, two-step…). A rhythm or chord progression has no author, so every pattern, bass line, melody and
text in the courses was written from scratch for Tidal Studio. Nothing was copied from tutorials, songs or other
live-coding examples. Strudel's own examples are AGPL and its contributed tunes carry separate terms, so none of them
were used.

These pages were used as references and are linked from each course as further reading:

**Merengue**
- [Wikipedia · Merengue music](https://en.wikipedia.org/wiki/Merengue_music)
- [Wikipedia · Güira](https://en.wikipedia.org/wiki/G%C3%BCira)
- [Soundbrenner · The merengue rhythm](https://www.soundbrenner.com/blogs/articles/merengue-rhythm)
- [Clark College · Latin percussion clinic (PDF)](https://www.clark.edu/about/arts-events/music/jazz_festival/documents/latinpercussionclinicfernandez2020.pdf)

**Salsa**
- [Wikipedia · Clave (rhythm)](https://en.wikipedia.org/wiki/Clave_(rhythm))
- [Wikipedia · Tumbao](https://en.wikipedia.org/wiki/Tumbao)
- [Piano With Jonny · Piano montunos](https://pianowithjonny.com/piano-lessons/piano-montunos-the-complete-guide/)
- [Soundbrenner · Salsa rhythm](https://www.soundbrenner.com/blogs/articles/salsa-rhythm)

**Cumbia**
- [Wikipedia · Cumbia (Colombia)](https://en.wikipedia.org/wiki/Cumbia_(Colombia))
- [Reverb · How to play the cumbia style](https://reverb.com/news/latin-beats-how-to-play-the-cumbia-style)

**Reggaeton**
- [Wikipedia · Dembow](https://en.wikipedia.org/wiki/Dembow)
- [MusicRadar · How to make a reggaeton beat](https://www.musicradar.com/news/beat-building-how-to-produce-a-reggaeton-beat)
- [Native Instruments · Reggaeton](https://www.native-instruments.com/en/blogs/blog/reggaeton)
- [Berklee · Dembow explained](https://www.berklee.edu/node/2559651)

**Bossa nova**
- [Wikipedia · Bossa nova](https://en.wikipedia.org/wiki/Bossa_nova)
- [Soundbrenner · Bossa nova rhythm](https://www.soundbrenner.com/blogs/articles/bossa-nova-rhythm)
- [MusicRadar · Programming bossa nova beats](https://www.musicradar.com/how-to/how-to-program-and-transfer-authentic-bossa-nova-beats)

**Jazz (swing)**
- [Wikipedia · Swing (jazz performance style)](https://en.wikipedia.org/wiki/Swing_(jazz_performance_style))
- [Wikipedia · Walking bass](https://en.wikipedia.org/wiki/Walking_bass)
- [Wikipedia · ii–V–I progression](https://en.wikipedia.org/wiki/Ii%E2%80%93V%E2%80%93I_progression)

**Funk**
- [Wikipedia · Funk](https://en.wikipedia.org/wiki/Funk)
- [Wikipedia · Ghost note](https://en.wikipedia.org/wiki/Ghost_note)

**House**
- [Wikipedia · House music](https://en.wikipedia.org/wiki/House_music)
- [Production Music Live · House drum patterns](https://www.productionmusiclive.com/blogs/news/how-to-make-house-drum-patterns-beginners)

**Techno**
- [Ableton · Generating techno drum patterns](https://www.ableton.com/en/blog/generating-techno-drum-patterns/)
- [Wikipedia · Euclidean rhythm](https://en.wikipedia.org/wiki/Euclidean_rhythm)
- [Wikipedia · Techno](https://en.wikipedia.org/wiki/Techno)

**Drum & bass**
- [Native Instruments · Drum and bass](https://www.native-instruments.com/en/blogs/blog/drum-and-bass)
- [MusicRadar · Jungle and DnB grooves](https://www.musicradar.com/how-to/how-to-program-6-different-jungle-and-drum-n-bass-grooves)
- [EDMProd · How to make drum & bass](https://www.edmprod.com/how-to-make-drum-and-bass/)

**Lo-fi hip hop**
- [Wikipedia · Lo-fi music](https://en.wikipedia.org/wiki/Lo-fi_music)
- [Ableton · Make your first beat](https://www.ableton.com/en/blog/create-your-first-track-in-ableton-live/)

General: [TidalCycles documentation](https://tidalcycles.org/docs/) · [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples).
