# VivAIdi

Hum a melody. VivAIdi writes a 16-bar Classical piece around it, then hands you
the baton.

## Pipeline

1. **Listen** — [Spotify Basic Pitch](https://basicpitch.spotify.com) transcribes
   the hum; the key, tempo and two-bar basic idea are analysed from it.
2. **Compose** — a Classical sentence is planned around the theme: presentation,
   fragmented continuation to a half cadence, return to the climax, and a
   perfect authentic cadence. Harmony is chosen by a second-order search over
   functional syntax, melody agreement and bass motion, then realised by a
   voice-leading solver that refuses parallel fifths and octaves, voice
   crossing, doubled leading tones and unresolved sevenths.
3. **Arrange** — one of four ensembles scores the result idiomatically.
4. **Conduct** — [MediaPipe](https://ai.google.dev/edge/mediapipe) Hands drives
   the live mix.

The engine is symbolic, so your melody survives intact and every player is a
separate stem you can cue, balance and cut in real time.

## The four ensembles

| Ensemble | Players | Conduct groups |
| --- | --- | --- |
| Classical Orchestra | Violins, violas, cellos, basses, flute, oboe, clarinet, bassoon, horns, trumpets, timpani | Strings, Woodwinds, Brass, Timpani |
| String Quartet | Violin I, Violin II, viola, cello | one per player |
| Woodwind Quintet | Flute, oboe, clarinet, bassoon, horn | one per player |
| Wordless Choir | Soprano, alto, tenor, bass | one per voice |

**Classical Orchestra** uses Classical-period forces rather than film-score
percussion. Strings carry continuity, the winds are held back and then trade
short solos and counterlines, horns bridge the inner harmony in the alto
register, trumpets mark arrivals only, and the timpani are tuned to the tonic
and dominant — strokes and rolls at cadences and the climax. Families enter and
leave by phrase: the presentation is strings alone, the return re-scores the
theme for winds over tremolo strings, and only the cadence is tutti.

**String Quartet** treats four independent players, not a melody with padding.
Roles rotate: the upper voices answer each other in the continuation, the cello
takes the theme at the return while the inner voices play pizzicato, and the
texture alternates lifted offbeats, broken chords and a walking bass before the
homorhythmic cadence.

**Woodwind Quintet** passes the theme between flute, oboe and clarinet, uses the
bassoon as both bass and tenor soloist, and keeps the horn quiet as a harmonic
bridge. Spacing is open, articulations contrast, at least one player is always
resting, and every line is given breaths and multi-beat rests.

**Wordless Choir** keeps the hum in the soprano, transposed only as far as a
comfortable tessitura needs. Alto, tenor and bass move mostly stepwise inside
standard SATB ranges with suspensions and passing tones for life, the tenor
imitates the soprano in the continuation, and all four voices unify at the
cadence. Every voice lifts after each two-bar idea; per-voice EQ, panning and
soft attack and release take the mechanical edge off the General MIDI choir.

## Conducting

Each ensemble declares its own four or five conduct groups.

- **Finger spread** cues the groups in order — the first sounds from the
  downbeat, the rest join as your hand opens.
- **Hand height** is dynamics.
- **Horizontal position** brings that side of the stage forward, changing the
  balance between families rather than sliding the whole stereo image.
- **Fist** cuts the ensemble.

The pads under the stage toggle the same groups by hand.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Mic and camera need
localhost or HTTPS. Playback uses FluidR3 SoundFonts, one sample set per part,
decoded only across that player's range.

## Development

```bash
npm run lint      # eslint
npm test          # musical validation suite
npm run audition  # print a text score for every ensemble and test theme
```

Generation is deterministic: the same hum and ensemble always produce the same
score, which is what makes the test suite and `npm run audition` meaningful.
