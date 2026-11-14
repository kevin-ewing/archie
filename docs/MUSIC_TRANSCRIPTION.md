# Reproducing a reference recording as programmable music

This is the exact workflow and final specification used to turn the reference recording `IMG_2424.mov` into Archie's looping `patient-awe` progression. It is written so another agent can repeat the work from either a video or an audio file without relying on this conversation.

The canonical implementation is:

- progression and five authored voices: [`src/audio/music.ts`](../src/audio/music.ts)
- playback, tempo, transitions, synthesis, and mix: [`src/audio/audio.ts`](../src/audio/audio.ts)
- structural checks: [`src/audio/music.test.ts`](../src/audio/music.test.ts) and [`src/audio/audio.test.ts`](../src/audio/audio.test.ts)

If this document and code disagree, treat the tests and code as the shipped sound, then update this document in the same change.

## Reference used for the current track

Original file: `IMG_2424.mov`

SHA-256:

```text
057ce0fdd6a3135d83c6f0dfd9000293cc28dd8a65f7c6e01ba895d0dc16f467
```

Media properties:

```text
duration: 70.540499 seconds
audio: AAC, 44,100 Hz, stereo
video: HEVC, 576×1024, 30 fps
```

Do not derive tempo by dividing the number of chords by the entire file duration. A phone recording can contain lead-in, release, camera handling, or trailing material. Set musical time zero at the first chord onset and measure transitions relative to that onset.

## 1. Extract lossless analysis material

Keep the original untouched. FFmpeg accepts both video containers and audio-only files for the audio command.

```sh
mkdir -p analysis/frames

# Works for MOV/MP4 video and WAV/M4A/MP3 audio. It selects the first audio stream,
# removes video, preserves stereo, and avoids another lossy encode.
ffmpeg -i INPUT_FILE -map 0:a:0 -vn -ar 44100 -ac 2 -c:a pcm_s24le analysis/reference.wav

# Make a mono analysis copy; keep reference.wav for checking stereo details.
ffmpeg -i analysis/reference.wav -af "pan=mono|c0=0.5*c0+0.5*c1" -c:a pcm_s24le analysis/reference-mono.wav
```

For a video input, also extract frames. Frames do not determine pitch, but they preserve visible performance cues and make it possible to correlate a hand movement or displayed chord name with an audio transition.

```sh
ffmpeg -i INPUT_FILE -map 0:v:0 -vf "fps=2,scale=576:-1" analysis/frames/%05d.png
```

Confirm what was extracted:

```sh
ffprobe -v error \
  -show_entries format=duration:stream=index,codec_type,codec_name,sample_rate,channels,channel_layout,r_frame_rate,width,height \
  -of json INPUT_FILE
```

If the input is audio-only, skip frame extraction. Every remaining step is identical.

## 2. Make listening views, not replacement audio

The reference makes upper voices easier to hear than bass and middle voices. Create temporary filtered copies and a spectrogram, but always verify decisions against the unfiltered recording.

```sh
ffmpeg -i analysis/reference-mono.wav -af "lowpass=f=260,volume=6dB" analysis/bass.wav
ffmpeg -i analysis/reference-mono.wav -af "highpass=f=180,lowpass=f=1800,volume=3dB" analysis/mids.wav
ffmpeg -i analysis/reference-mono.wav -af "highpass=f=1500" analysis/highs.wav
ffmpeg -i analysis/reference-mono.wav -lavfi "showspectrumpic=s=2400x1200:legend=1:scale=log" analysis/spectrum.png

# Half speed without changing pitch, useful for locating inner voices and transitions.
ffmpeg -i analysis/reference.wav -af "atempo=0.5" analysis/half-speed.wav
```

For each chord transition:

1. Loop one second before through one second after the transition in the full mix.
2. Listen to `bass.wav` to identify the lowest note and its octave.
3. Listen to `mids.wav` for the third, seventh, ninth, suspension, and common tones.
4. Use `highs.wav` only to verify the upper voice; do not voice every part in that register.
5. Check the video frame sequence for any visible chord label or performance gesture.
6. Record every voice as a MIDI number, not only a chord symbol. A chord symbol cannot reproduce octave placement or voice leading.

Pitch/chroma detection may be used as a second opinion, never as the authority. Phone recordings, reverb, and closely spaced sustained notes commonly produce octave errors and missing inner voices.

## 3. Establish the tempo and durations

The reference grid was measured as:

- ordinary chord: about 2 seconds
- held/home chord: about 4 seconds
- final chord: about 3 seconds

Those durations correspond to **60 BPM** in 4/4 when encoded as 2, 4, and 3 beats. The recording's musical grid is therefore approximately 60 BPM.

The shipped game was deliberately slowed after listening feedback. It uses **40 BPM**, not 60 BPM:

```ts
const MUSIC_BPM = 40;
seconds = beats * 60 / MUSIC_BPM;
```

At 40 BPM:

- 2 beats = 3 seconds
- 4 beats = 6 seconds
- 3 beats = 4.5 seconds
- 59 total beats = **88.5 seconds per loop**

This distinction is intentional. Do not “fix” the game to 60 BPM merely because that is closer to the source recording. For a new reference, first document its measured tempo, then separately document any artistic playback tempo chosen for the game.

## 4. Exact progression, timing, and voicing

Pitch classes use C = 0 through B = 11. MIDI note 60 is middle C. Each chord has exactly five persistent voices; duplicated chord tones are intentional.

The `game start` and `game end` columns are seconds at the shipped 40 BPM. To recover the approximate reference grid at 60 BPM, multiply the beat columns by 1 second instead of 1.5 seconds.

| # | Symbol | Beats | Game start | Game end | Five MIDI voices, low to high |
|---:|---|---:|---:|---:|---|
| 1 | Bbadd9 | 4 | 0 | 6 | 46, 53, 62, 70, 72 |
| 2 | Fsus4 | 2 | 6 | 9 | 41, 53, 60, 70, 72 |
| 3 | F | 2 | 9 | 12 | 41, 53, 60, 69, 72 |
| 4 | Gm7 | 4 | 12 | 18 | 43, 53, 62, 67, 70 |
| 5 | Ebmaj9 | 4 | 18 | 24 | 39, 53, 62, 67, 70 |
| 6 | Bb | 2 | 24 | 27 | 34, 53, 62, 65, 70 |
| 7 | Dm7 | 2 | 27 | 30 | 38, 53, 60, 62, 69 |
| 8 | Ebadd9 | 2 | 30 | 33 | 39, 53, 63, 67, 70 |
| 9 | Cm7 | 2 | 33 | 36 | 36, 60, 63, 67, 70 |
| 10 | Gm9 | 2 | 36 | 39 | 43, 53, 62, 69, 70 |
| 11 | F | 2 | 39 | 42 | 41, 53, 60, 69, 72 |
| 12 | Ebmaj7 | 2 | 42 | 45 | 39, 55, 58, 62, 67 |
| 13 | F7sus4 | 2 | 45 | 48 | 41, 58, 60, 63, 72 |
| 14 | Bbadd9 | 2 | 48 | 51 | 46, 53, 62, 70, 72 |
| 15 | F | 2 | 51 | 54 | 41, 53, 60, 69, 72 |
| 16 | Gm7 | 2 | 54 | 57 | 43, 53, 62, 67, 70 |
| 17 | Dm7 | 2 | 57 | 60 | 38, 53, 60, 62, 69 |
| 18 | Ebmaj9 | 2 | 60 | 63 | 39, 53, 62, 67, 70 |
| 19 | F | 2 | 63 | 66 | 41, 53, 60, 69, 72 |
| 20 | Gm9 | 2 | 66 | 69 | 43, 53, 58, 62, 69 |
| 21 | D7#9 | 2 | 69 | 72 | 38, 53, 60, 66, 69 |
| 22 | Ebmaj7 | 2 | 72 | 75 | 39, 55, 58, 62, 67 |
| 23 | Ebm6 | 2 | 75 | 78 | 39, 58, 60, 63, 66 |
| 24 | Cm9 | 2 | 78 | 81 | 36, 51, 62, 67, 70 |
| 25 | F7sus4 | 2 | 81 | 84 | 41, 58, 60, 63, 72 |
| 26 | Bb6/9 | 3 | 84 | 88.5 | 46, 53, 62, 67, 72 |

The longer opening Bbadd9, Gm7, and Ebmaj9 are the “home” or resting moments requested during iteration. The final Bb6/9 is three beats so the loop resolves without lingering as long as a four-beat home chord.

## 5. Playback rules that are part of the transcription

Merely entering the chord names will not reproduce the result. Preserve all of these rules:

1. Create five `Tone.MonoSynth` instances once and keep them alive for the full progression.
2. On the first chord, call `triggerAttack` once per voice.
3. On later chords, move each existing voice to its next MIDI pitch. Do not release and retrigger the chord.
4. Every transition takes exactly **0.28 seconds**, regardless of interval size. Do not use distance-dependent portamento.
5. Use an exponential frequency ramp after `cancelAndHoldAtTime(now)`.
6. Loop chord 26 directly back to chord 1 with the same 0.28-second transition.
7. Reset to chord 1 when the game starts, even if audio was unlocked during loading.
8. Fade the complete audio master from silence over **1.8 seconds** at launch. The individual first notes use a nearly immediate 0.02-second attack; the master fade supplies the audible entrance.

Relevant constants:

```ts
MUSIC_BPM = 40
MUSIC_GLIDE_SECONDS = 0.28
STARTUP_FADE_SECONDS = 1.8
DEFAULT_MUSIC_VOLUME = 0.4
MUSIC_LEVELS = [0, -6, -7, -9, -15]
```

`MUSIC_LEVELS` is ordered from the lowest voice to the highest. It intentionally emphasizes bass and low mids and suppresses the top voice, correcting the early version where only the high notes were clearly audible.

## 6. Exact synth and effects settings

Each of the five voices is a `Tone.MonoSynth` with:

```ts
{
  portamento: 0,
  oscillator: {
    type: 'fatsawtooth',
    count: 2,
    spread: voiceIndex === 0 ? 5 : 9
  },
  filter: {
    type: 'lowpass',
    frequency: 1100,
    Q: 0.6,
    rolloff: -24
  },
  envelope: {
    attack: 0.02,
    decay: 0.8,
    sustain: 0.72,
    release: 4
  },
  filterEnvelope: {
    attack: 0.03,
    decay: 1.8,
    sustain: 0.58,
    release: 4,
    baseFrequency: 170,
    octaves: 3.1
  }
}
```

The shared effects chain is:

```text
five voices
  → low-pass filter: 1200 Hz, -12 dB/octave, Q 0.35
  → chorus: frequency 0.1, delayTime 4.5, depth 0.18, spread 150, wet 0.12
  → reverb: decay 5.8, preDelay 0.09, wet 0.22
  → music master gain: perceptual curve volume²
  → shared compressor: threshold -12, knee 14, ratio 5, attack 0.008, release 0.22
  → startup master fade
```

This gives the requested brass-like low-mid weight without adding samples or a heavy sampler. Avoid raising filter cutoff or the upper voices first; that recreates the overly bright, thin version rejected during iteration.

## 7. Verification checklist

Before considering a transcription complete:

- [ ] Both video and audio streams were inventoried when the source is a video.
- [ ] Audio was extracted losslessly before analysis.
- [ ] The first musical onset, not file time zero, defines the timing origin.
- [ ] Every chord symbol was checked against bass, mids, highs, and the full mix.
- [ ] Every chord has explicit MIDI pitches and octave placement.
- [ ] There are five voices in every chord.
- [ ] Bass and middle voices remain clearly audible at default volume.
- [ ] Ordinary, home, tense, and final durations match the reference or are explicitly documented artistic changes.
- [ ] Glide time is constant across small and large intervals.
- [ ] The last chord transitions cleanly into the first.
- [ ] Starting playback always begins on chord 1.
- [ ] `npm run check` passes.
- [ ] Listening comparison is performed at the same output volume; louder is not treated as more accurate.

For this progression, the automated invariants are: 26 chords, 59 beats, 4/4, loop enabled, five valid chord-tone MIDI voices per chord, first voicing `[46, 53, 62, 70, 72]`, fixed 0.28-second glide, and 1.8-second startup fade.

## 8. Common failure modes from this track's iteration

- **Only the high notes are audible:** lower one or more authored voices by an octave and rebalance `MUSIC_LEVELS`; do not simply boost the whole track.
- **The bass exists on paper but is not perceived:** inspect the actual MIDI octave and low-pass/filter-envelope balance, not only the chord root name.
- **Chord changes sound like separate attacks:** keep persistent voices and glide their frequencies instead of retriggering.
- **Large intervals smear for too long:** use the fixed 0.28-second transition; never derive glide duration from pitch distance.
- **The opening swells twice:** keep synth attack near-instant and perform the audible entrance with the shared 1.8-second master fade.
- **The loop feels hurried at home chords:** preserve the authored 4-beat holds.
- **The implementation matches source tempo but not the approved game feel:** remember that source is approximately 60 BPM while the shipped playback is intentionally 40 BPM.
- **An analyzer reports a plausible chord but the recording disagrees:** trust repeated listening to isolated frequency bands and the visible performance evidence over automatic labels.

