// Fixed-timestep loop: the simulation runs at a steady 60 Hz (deterministic, frame-rate independent);
// rendering runs once per display frame and gets `alpha`, how far it is between the last two sim ticks,
// so 90/120/144 Hz screens can draw smooth in-between positions (see `blend`).

const MAX_FRAME_SECONDS = 0.25; // clamp so a long pause (backgrounded tab) can't trigger a catch-up spiral

export function startLoop(update: (dt: number) => void, render: (alpha: number) => void, hz = 60, active = () => true): void {
  const step = 1 / hz;
  let acc = 0;
  let last = performance.now();

  function frame(now: number) {
    requestAnimationFrame(frame); // first, so one bad frame (an exception) can't stop the game for good
    if (!active()) {
      acc = 0;
      last = now;
      return;
    }
    acc += Math.min(Math.max(0, now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    while (acc >= step) {
      update(step);
      acc -= step;
    }
    render(acc / step);
  }

  requestAnimationFrame(frame);
}

const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * Blend two snapshots of plain state, a → b by t ∈ [0, 1]. Numbers interpolate (keys in `angles` the
 * short way round); anything else is taken from b.
 */
export function blend<T extends object>(a: T, b: T, t: number, angles: readonly (keyof T)[] = []): T {
  const out = { ...b };
  for (const k of Object.keys(b) as (keyof T)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va !== 'number' || typeof vb !== 'number') continue;
    (out[k] as number) = angles.includes(k) ? wrap(va + wrap(vb - va) * t) : va + (vb - va) * t;
  }
  return out;
}
