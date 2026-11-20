# Genre courses · build a song from scratch

**English** · Spanish text lives in the app itself (switch with the ES/EN button).

Open **Genre courses** in the top bar. Each course builds one complete song in one genre, the way a production class
would: the signature rhythm first, then bass, harmony, melody, arrangement (16 bars, written as `mask`) and mix
(the Mix tab's dB and EQ). Every step adds tracks that already sound good, Maestro explains the musical *why* and the
code piece by piece, and each step ends with a small challenge. «Hear the result» on each course card plays the
finished song for a few bars before you start.

## How the code was checked

- Every track in every course (66 tracks) was compiled and evaluated with the real TidalCycles
  pattern library (tidal-core 1.10.0): it type-checks, the mini-notation parses, and it produces events.
- Every sample name and index exists in [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) (for example
  `drumtraks:0` is a cabasa, `808:2` claves, `808:4` maracas, `808hc/808mc/808lc` congas, `drumtraks:7` a ride).
  Pitched parts use the studio's synths (superpiano, superpwm, supersaw, superhammond, supertrumpet, supersquare,
  sawtooth, triangle) or the `gtr` sample pitched with `note`.
- The code in the challenges was compiled the same way.

## Courses

| Course | Origin | BPM | Key / progression | Steps | You learn |
|---|---|---|---|---|---|
| Merengue | Dominican Republic | 136 | C major · I–IV–V7–I | The güira: the engine → Tambora and kick → The bass that jumps ahead → Off-beat piano → The horn mambo → Arrangement: intro, merengue and mambo → Mix: let everything be heard | Güira and tambora, Anticipated bass, Horn mambo |
| Salsa | Cuba · Puerto Rico · New York | 180 | C major · I–IV–V–IV | The 2-3 clave → Congas and cowbell → The bass tumbao → The piano montuno → The horns → Arrangement: intro, montuno and mambo → Orchestra mix | 2-3 clave, Tumbao, Montuno |
| Cumbia | Colombia | 96 | A minor · i–iv–V7–i | The guacharaca → Llamador and tambora → Root-and-fifth bass → The off-beat organ → The melody → Arrangement → Mix | Off-beat, Root and fifth, Harmonic minor |
| Reggaeton | Puerto Rico · Panama | 92 | A minor · i–VI–III–VII | The kick → The dembow snare → 808 bass in tresillo → Chord pad → The hook with echo → Arrangement: intro and drop → Mix | Dembow, Tresillo, Tempo-synced delay |
| Bossa nova | Brazil | 130 | C major · Imaj7–vi7–ii7–V7 | Sixteenth-note shaker → Surdo and rimshot → Bass → The guitar (batida) → Flute melody → Arrangement → Intimate mix | Seventh chords, Batida, Syncopation |
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
