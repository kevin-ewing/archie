// Game audio: one lazy Web Audio graph with a master bus and one bus per sound family.
// Browsers require a user gesture before playback, so `unlock` creates/resumes the graph on demand.

import { PATIENT_AWE } from './music.ts';
import * as Tone from 'tone';

export type EngineAudio = { rpm: number; rough: number; bank: number; heat: number; boosting: boolean; overheated: boolean };

export type GameAudio = {
  unlock: () => Promise<void>;
  start: () => void;
  updateEngine: (state: EngineAudio) => void;
  setVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setPaused: (paused: boolean) => void;
};

export const DEFAULT_ENGINE_VOLUME = 0.4;
export const DEFAULT_MUSIC_VOLUME = 0.4;
export const STARTUP_FADE_SECONDS = 1.8;
const MUSIC_BPM = 40;
export const MUSIC_GLIDE_SECONDS = 0.28;

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const MUSIC_LEVELS = [0, -6, -7, -9, -15] as const;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Pure targets for the live graph; kept separate so tuning stays cheap to test. */
export function engineSound(state: EngineAudio) {
  const rpm = clamp(state.rpm, 500, 2000);
  const rough = clamp(state.rough);
  const load = clamp(Math.abs(state.bank));
  // Power is heard mainly as a harder, louder engine. Compressing the dial RPM range avoids the
  // implausible synth-like octave sweep the first version made.
  const audibleRpm = (1250 + (rpm - 1250) * 0.28) * (1 - load * 0.065);
  return {
    firingHz: (audibleRpm * 4) / 60, // four firing pulses per revolution for a V8 four-stroke
    bodyHz: audibleRpm / 60,
    cutoffHz: 720 + audibleRpm * 0.38 + (state.boosting ? 70 : 0) - rough * 50,
    firingGain: 0.3 - rough * 0.025,
    bodyGain: 0.3 + load * 0.055,
    noiseGain: 0.009 + rough * 0.026 + load * 0.007,
    wobbleCents: 1.5 + rough * 5 + load * 2,
    engineGain: 0.12 + (state.boosting ? 0.038 : 0) + load * 0.01,
  };
}

/** Seconds to the next heat fault; Infinity means the engine is healthy. */
export function faultDelay(heat: number, overheated: boolean, random: number): number {
  if (!overheated && heat < 0.65) return Infinity;
  if (overheated) return 1.2 + clamp(random) * 2;
  const severity = clamp((heat - 0.65) / 0.35);
  return (0.18 + clamp(random) * 0.42) / (0.5 + severity * 1.2);
}

export function backfireChance(heat: number, overheated: boolean): number {
  if (overheated) return 0.55;
  const severity = clamp((heat - 0.65) / 0.35);
  return 0.7 + severity * 0.28;
}

export function backfireLevel(heat: number, overheated: boolean): number {
  if (overheated) return 0.34;
  return 0.36 + clamp((heat - 0.65) / 0.35) * 0.5;
}

export const volumeGain = (volume: number) => clamp(volume) ** 2;

export function createAudio(initialVolume = DEFAULT_ENGINE_VOLUME, initialMusicVolume = DEFAULT_MUSIC_VOLUME): GameAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicMaster: GainNode | null = null;
  let startupGain: GainNode | null = null;
  let musicVoices: Tone.MonoSynth[] = [];
  let musicStarted = false;
  let musicChord = 0;
  let nextMusicChordAt = 0;
  let engine: GainNode | null = null;
  let firing: OscillatorNode | null = null;
  let body: OscillatorNode | null = null;
  let firingGain: GainNode | null = null;
  let bodyGain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let noiseGain: GainNode | null = null;
  let wobbleDepth: GainNode | null = null;
  let backfireGain: GainNode | null = null;
  let sputterGain: GainNode | null = null;
  let worklet: AudioWorkletNode | null = null;
  let workletStart: Promise<void> | null = null;
  let nextFaultAt = Infinity;
  let volume = clamp(initialVolume);
  let musicVolume = clamp(initialMusicVolume);
  let paused = false;
  let started = false;
  let state: EngineAudio = { rpm: 1250, rough: 0, bank: 0, heat: 0, boosting: false, overheated: false };

  const target = (param: AudioParam, value: number, seconds = 0.06) => {
    if (!context) return;
    param.cancelAndHoldAtTime(context.currentTime);
    param.setTargetAtTime(value, context.currentTime, seconds);
  };

  const advanceMusic = () => {
    if (!started || !context || !musicVoices.length || paused || context.currentTime < nextMusicChordAt) return;
    const chord = PATIENT_AWE.chords[musicChord];
    const now = context.currentTime;
    musicVoices.forEach((voice, i) => {
      const hz = frequency(chord.midi[i]);
      if (musicStarted) voice.frequency.cancelAndHoldAtTime(now).exponentialRampTo(hz, MUSIC_GLIDE_SECONDS, now);
      else voice.triggerAttack(hz, now, 0.32);
    });
    musicStarted = true;
    musicChord = (musicChord + 1) % PATIENT_AWE.chords.length;
    nextMusicChordAt = now + (chord.beats * 60) / MUSIC_BPM;
  };

  const apply = () => {
    if (!context || !engine || !firing || !body || !firingGain || !bodyGain || !filter || !noiseGain || !wobbleDepth) return;
    const sound = engineSound(state);
    worklet?.port.postMessage({ rpm: (sound.firingHz * 60) / 4, load: Math.abs(state.bank), rough: state.rough, boosting: state.boosting });
    target(firing.frequency, sound.firingHz);
    target(body.frequency, sound.bodyHz);
    target(filter.frequency, sound.cutoffHz, 0.1);
    target(firingGain.gain, worklet ? 0 : sound.firingGain);
    target(bodyGain.gain, worklet ? 0 : sound.bodyGain);
    target(noiseGain.gain, worklet ? 0 : sound.noiseGain);
    target(wobbleDepth.gain, sound.wobbleCents, 0.12);
    target(engine.gain, paused ? 0 : sound.engineGain, paused ? 0.02 : 0.08);
    advanceMusic();

    const now = context.currentTime;
    const delay = faultDelay(state.heat, state.overheated, Math.random());
    if (!Number.isFinite(delay) || paused) nextFaultAt = Infinity;
    else if (!Number.isFinite(nextFaultAt)) nextFaultAt = now + delay;
    else if (now >= nextFaultAt) {
      if (Math.random() < backfireChance(state.heat, state.overheated) && backfireGain) {
        const p = backfireGain.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(0.001, now);
        p.exponentialRampToValueAtTime(backfireLevel(state.heat, state.overheated), now + 0.012);
        p.exponentialRampToValueAtTime(0.001, now + 0.14);
      } else {
        // Sputters are additive exhaust chuffs; never mute or cut the continuous engine underneath.
        if (sputterGain) {
          const s = sputterGain.gain;
          s.cancelScheduledValues(now);
          s.setValueAtTime(0.001, now);
          s.exponentialRampToValueAtTime(0.22, now + 0.012);
          s.exponentialRampToValueAtTime(0.001, now + 0.055);
          s.exponentialRampToValueAtTime(0.17, now + 0.085);
          s.exponentialRampToValueAtTime(0.001, now + 0.145);
        }
      }
      nextFaultAt = now + faultDelay(state.heat, state.overheated, Math.random());
    }
  };

  const build = () => {
    if (context) return;
    context = new AudioContext({ latencyHint: 'interactive' });
    Tone.setContext(context);
    master = new GainNode(context, { gain: volumeGain(volume) });
    musicMaster = new GainNode(context, { gain: volumeGain(musicVolume) });
    startupGain = new GainNode(context, { gain: 0 });
    const limiter = new DynamicsCompressorNode(context, { threshold: -12, knee: 14, ratio: 5, attack: 0.008, release: 0.22 });
    limiter.connect(startupGain).connect(context.destination);
    musicMaster.connect(limiter);
    const musicFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, rolloff: -12, Q: 0.35 });
    const chorus = new Tone.Chorus({ frequency: 0.1, delayTime: 4.5, depth: 0.18, spread: 150, wet: 0.12 }).start();
    const reverb = new Tone.Reverb({ decay: 5.8, preDelay: 0.09, wet: 0.22 });
    musicFilter.chain(chorus, reverb);
    reverb.connect(musicMaster);
    musicVoices = PATIENT_AWE.chords[0].midi.map((_, i) =>
      new Tone.MonoSynth({
        volume: MUSIC_LEVELS[i],
        portamento: 0,
        oscillator: { type: 'fatsawtooth', count: 2, spread: i === 0 ? 5 : 9 },
        filter: { type: 'lowpass', frequency: 1100, Q: 0.6, rolloff: -24 },
        envelope: { attack: 0.02, decay: 0.8, sustain: 0.72, release: 4 },
        filterEnvelope: { attack: 0.03, decay: 1.8, sustain: 0.58, release: 4, baseFrequency: 170, octaves: 3.1 },
      }).connect(musicFilter),
    );
    nextMusicChordAt = context.currentTime;
    engine = new GainNode(context, { gain: 0 });
    filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 1250, Q: 0.45 });
    firing = new OscillatorNode(context);
    // A compact combustion pulse: both even and odd harmonics, progressively softer toward the top.
    // This has more engine character than a triangle, without a sawtooth's abrasive high-frequency stack.
    firing.setPeriodicWave(
      context.createPeriodicWave(
        new Float32Array([0, 0, 0.16, 0.1, 0.055, 0.03, 0.018, 0.01]),
        new Float32Array([0, 1, 0.52, 0.28, 0.15, 0.08, 0.045, 0.025]),
      ),
    );
    body = new OscillatorNode(context, { type: 'sine' });
    firingGain = new GainNode(context, { gain: 0.3 });
    bodyGain = new GainNode(context, { gain: 0.3 });

    const noise = new AudioBufferSourceNode(context, { loop: true });
    const noiseBuffer = new AudioBuffer({ length: context.sampleRate * 2, sampleRate: context.sampleRate });
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noise.buffer = noiseBuffer;
    const noiseFilter = new BiquadFilterNode(context, { type: 'bandpass', frequency: 650, Q: 0.55 });
    noiseGain = new GainNode(context, { gain: 0.009 });
    const driftFilter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 3, Q: 0.5 });
    const driftDepth = new GainNode(context, { gain: 10 });
    const wobble = new OscillatorNode(context, { type: 'sine', frequency: 1.7 });
    wobbleDepth = new GainNode(context, { gain: 1.5 });
    const backfireFilter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 300, Q: 0.55 });
    backfireGain = new GainNode(context, { gain: 0.001 });
    const backfireTone = new OscillatorNode(context, { type: 'triangle', frequency: 58 });
    const backfireToneGain = new GainNode(context, { gain: 0.4 });
    const sputterFilter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 360, Q: 0.7 });
    sputterGain = new GainNode(context, { gain: 0.001 });
    const sputterBodyGain = new GainNode(context, { gain: 0.24 });
    const exhaustBody = new BiquadFilterNode(context, { type: 'peaking', frequency: 175, Q: 1.1, gain: 4 });
    const exhaustPresence = new BiquadFilterNode(context, { type: 'peaking', frequency: 720, Q: 0.8, gain: 2.5 });

    firing.connect(firingGain).connect(filter);
    body.connect(bodyGain).connect(filter);
    noise.connect(noiseFilter).connect(noiseGain).connect(filter);
    noise.connect(driftFilter).connect(driftDepth).connect(firing.detune);
    driftDepth.connect(body.detune);
    wobble.connect(wobbleDepth).connect(firing.detune);
    wobbleDepth.connect(body.detune);
    noiseFilter.connect(backfireFilter).connect(backfireGain).connect(master);
    backfireTone.connect(backfireToneGain).connect(backfireGain);
    noise.connect(sputterFilter).connect(sputterGain).connect(master);
    body.connect(sputterBodyGain).connect(sputterGain);
    filter.connect(exhaustBody).connect(exhaustPresence).connect(engine).connect(master).connect(limiter);
    firing.start();
    body.start();
    noise.start();
    wobble.start();
    backfireTone.start();
    apply();
  };

  const startWorklet = () =>
    (workletStart ??= (async () => {
      if (!context || !engine) return;
      try {
        await context.audioWorklet.addModule(new URL('./engine-processor.js', import.meta.url));
        worklet = new AudioWorkletNode(context, 'raf1a-engine-processor', { outputChannelCount: [1] });
        worklet.connect(engine);
        apply(); // cross-fade by smoothly muting the oscillator fallback
      } catch (e) {
        console.warn('RAF 1a AudioWorklet unavailable; using oscillator fallback.', e);
      }
    })());

  const start = () => {
    started = true;
    if (!context || !startupGain) return;
    const now = context.currentTime;
    musicChord = 0;
    musicStarted = false;
    nextMusicChordAt = now;
    advanceMusic();
    startupGain.gain.cancelAndHoldAtTime(now);
    startupGain.gain.linearRampToValueAtTime(1, now + STARTUP_FADE_SECONDS);
  };

  return {
    async unlock() {
      build();
      await startWorklet();
      if (context?.state === 'suspended') await context.resume();
      if (started && !musicStarted) start(); // repeated gesture unlocks must not strike chord one again
    },
    start,
    updateEngine(next) {
      state = next;
      apply();
    },
    setVolume(next) {
      volume = clamp(next);
      if (master) target(master.gain, volumeGain(volume), 0.03);
    },
    setMusicVolume(next) {
      musicVolume = clamp(next);
      if (musicMaster) target(musicMaster.gain, volumeGain(musicVolume), 0.03);
    },
    setPaused(next) {
      paused = next;
      if (context) void (next ? context.suspend() : context.resume());
      apply();
    },
  };
}
