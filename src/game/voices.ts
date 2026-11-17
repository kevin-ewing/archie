// Voices from someone you can't see: your observer in flight (shouting over the engine), the squadron at base
// (the Major, the Recording Officer, the riggers, the other pilots). Pure: who's speaking, what's next, and
// when each line is revealed and gone; ui/voice.ts pops it up as text (no sound, for now). No DOM.
//
// Each speaker belongs to scenes ('flight', 'base'). A line waits until its scene is the one you're in: the
// Major's word for you when you land is held through the flight and spoken in the barn. Higher priority goes
// first; `interrupt` cuts in over whatever is being said.

export type Scene = 'flight' | 'base';
export type Speaker = {
  name: string; // as it's shown: the game's capitals
  scenes: readonly Scene[];
  rate?: number; // letters revealed per second (default 24)
};

/** Who can speak. Names are roles until the cast is settled (docs/STORY.md). */
export const SPEAKERS = {
  observer: { name: 'OBSERVER', scenes: ['flight'], rate: 26 },
  major: { name: 'THE MAJOR', scenes: ['base'], rate: 20 },
  recording: { name: 'RECORDING OFFICER', scenes: ['base'] },
  rigger: { name: 'FLIGHT SERGEANT', scenes: ['base'] },
  mechanic: { name: 'AIR MECHANIC', scenes: ['base'], rate: 28 },
  pilot: { name: 'A PILOT', scenes: ['base'], rate: 26 },
} as const satisfies Record<string, Speaker>;
export type SpeakerId = keyof typeof SPEAKERS;

export type Line = {
  speaker: SpeakerId;
  text: string; // in the game's lettering: capitals, digits, . / - ? : (no commas or apostrophes)
  scene?: Scene; // where it's said (default: the speaker's first scene)
  priority?: number; // higher first (default 0)
  interrupt?: boolean; // cut in over the current line
  delay?: number; // seconds to wait, once it's its turn, before it starts
};
export type Showing = { line: Line; speaker: Speaker; shown: number; done: boolean };
export type VoiceEvent = { type: 'start' | 'end'; line: Line } | { type: 'letter'; line: Line; index: number; ch: string };

/** How long a line stays once fully revealed: long enough to read, longer for longer lines. */
export const holdFor = (text: string) => 1.4 + text.length * 0.035;
const GAP = 0.35; // seconds of quiet between lines

export function createVoices(scene: Scene = 'base') {
  const queue: (Line & { n: number })[] = [];
  let n = 0;
  let now: { line: Line; speaker: Speaker; t: number; revealed: number; reveal: number; hold: number } | null = null;
  let wait = 0;
  let cutIn: Line | null = null; // an interruption: it goes next, whatever else is waiting
  const sceneOf = (l: Line) => l.scene ?? SPEAKERS[l.speaker].scenes[0];
  const next = () => {
    if (cutIn && sceneOf(cutIn) === scene) return cutIn;
    const here = queue.filter((l) => sceneOf(l) === scene).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.n - b.n);
    return here[0];
  };
  const begin = (l: Line, events: VoiceEvent[]) => {
    queue.splice(queue.indexOf(l as Line & { n: number }), 1);
    if (l === cutIn) cutIn = null;
    const speaker: Speaker = SPEAKERS[l.speaker];
    now = { line: l, speaker, t: -(l.delay ?? 0), revealed: 0, reveal: l.text.length / (speaker.rate ?? 24), hold: holdFor(l.text) };
    events.push({ type: 'start', line: l });
  };
  return {
    /** Queue a line (or cut in with it, `interrupt`). */
    say(line: Line) {
      const l = { ...line, n: n++ };
      queue.push(l);
      if (line.interrupt) {
        cutIn = l;
        if (now && sceneOf(line) === scene) { now = null; wait = 0; }
      }
    },
    /** Where you are: lines for other scenes wait. Leaving a scene cuts its line short. */
    setScene(next: Scene) {
      if (next === scene) return;
      scene = next;
      if (now && sceneOf(now.line) !== scene) now = null;
      wait = 0;
    },
    scene: () => scene,
    /** Forget queued lines (all, or one scene's). */
    clear(which?: Scene) {
      for (let i = queue.length - 1; i >= 0; i--) if (!which || sceneOf(queue[i]) === which) queue.splice(i, 1);
      if (now && (!which || sceneOf(now.line) === which)) now = null;
    },
    /** Advance by `dt` seconds: the letters revealed, lines begun and ended. */
    tick(dt: number): VoiceEvent[] {
      const events: VoiceEvent[] = [];
      if (!now) {
        wait -= dt;
        const l = next();
        if (l && wait <= 0) begin(l, events);
        if (!now) return events;
        dt = 0;
      }
      const c = now!;
      c.t += dt;
      const target = c.t <= 0 ? 0 : Math.min(c.line.text.length, Math.floor((c.t / c.reveal) * c.line.text.length));
      for (; c.revealed < target; c.revealed++) events.push({ type: 'letter', line: c.line, index: c.revealed, ch: c.line.text[c.revealed] });
      if (c.t >= c.reveal + c.hold) {
        events.push({ type: 'end', line: c.line });
        now = null;
        wait = GAP;
      }
      return events;
    },
    /** What's being said now, and how much of it shows. */
    showing(): Showing | null {
      return now ? { line: now.line, speaker: now.speaker, shown: now.revealed, done: now.revealed >= now.line.text.length } : null;
    },
    /** Anything said or waiting in this scene. */
    busy: () => !!now || queue.some((l) => sceneOf(l) === scene),
  };
}
export type Voices = ReturnType<typeof createVoices>;
