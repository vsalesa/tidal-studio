-- Arranque de TidalCycles para Tidal Studio (basado en el BootTidal oficial)
:set -XOverloadedStrings
:set prompt ""
:set prompt-cont ""

import Sound.Tidal.Context
import System.IO (hSetEncoding, stdout, utf8)
hSetEncoding stdout utf8

tidal <- startTidal (superdirtTarget {oLatency = 0.05, oAddress = "127.0.0.1", oPort = 57120}) (defaultConfig {cVerbose = True, cFrameTimespan = 1/20})

:{
let only = (hush >>)
    p = streamReplace tidal
    hush = streamHush tidal
    panic = do hush
               once $ sound "superpanic"
    list = streamList tidal
    mute = streamMute tidal
    unmute = streamUnmute tidal
    unmuteAll = streamUnmuteAll tidal
    unsoloAll = streamUnsoloAll tidal
    solo = streamSolo tidal
    unsolo = streamUnsolo tidal
    once = streamOnce tidal
    first = streamFirst tidal
    asap = once
    nudgeAll = streamNudgeAll tidal
    all = streamAll tidal
    resetCycles = streamResetCycles tidal
    setcps = asap . cps
    d1 = p 1 . (|< orbit 0)
    d2 = p 2 . (|< orbit 1)
    d3 = p 3 . (|< orbit 2)
    d4 = p 4 . (|< orbit 3)
    d5 = p 5 . (|< orbit 4)
    d6 = p 6 . (|< orbit 5)
    d7 = p 7 . (|< orbit 6)
    d8 = p 8 . (|< orbit 7)
    d9 = p 9 . (|< orbit 8)
    d10 = p 10 . (|< orbit 9)
    d11 = p 11 . (|< orbit 10)
    d12 = p 12 . (|< orbit 11)
    -- Ecualizador de 3 bandas de la mesa de mezcla (en dB; modulo studio_eq de studio-synths.scd)
    -- (sin tildes dentro de :{ :}: sin locale UTF-8, GHCi no lo lee y d1..d12 no se definen)
    eqlow = pF "eqlow"
    eqmid = pF "eqmid"
    eqhigh = pF "eqhigh"
:}

putStrLn "TIDAL_STUDIO_READY"
