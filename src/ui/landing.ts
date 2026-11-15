// The landing page (static markup in index.html, so it's on screen before any code loads): STORY,
// FREE FLY, SETTINGS beside a window onto the terrain (drawn by main.ts while the page is up). This wires
// its buttons once the code is here. Free Fly cuts to the take-off screen beneath.

export type Landing = {
  /** The terrain window's canvas, or null once the page is gone (skipped or chosen). */
  terrain: () => HTMLCanvasElement | null;
  /** Everything is loaded: swap the loading mark for the menu and the terrain. */
  ready: () => void;
};

const READY_AT_LATEST_MS = 12_000; // a world that won't finish loading still gets its menu

export function wireLanding(opts: { skip: boolean; onFreeFly: () => void; onStory: () => void; onSettings: (back: () => void) => void }): Landing {
  const page = document.getElementById('landing');
  const canvas = document.getElementById('landing-terrain');
  const none: Landing = { terrain: () => null, ready: () => {} };
  if (!page) {
    opts.onFreeFly();
    return none;
  }
  if (opts.skip) {
    page.hidden = true;
    opts.onFreeFly();
    return none;
  }
  const items = [...page.querySelectorAll<HTMLButtonElement>('.landing-item')];
  const ready = () => page.classList.add('ready');
  setTimeout(ready, READY_AT_LATEST_MS);
  let chosen = false;
  const leave = () => {
    if (chosen) return;
    chosen = true;
    page.hidden = true; // a clean cut to the take-off screen, no fade
    opts.onFreeFly();
  };
  document.getElementById('landing-story')?.addEventListener('click', opts.onStory);
  document.getElementById('landing-free')?.addEventListener('click', leave);
  document.getElementById('landing-settings')?.addEventListener('click', () => {
    page.classList.add('behind'); // the settings panel takes the menu's place; BACK brings the menu back
    opts.onSettings(() => {
      page.classList.remove('behind');
      document.getElementById('landing-settings')?.focus();
    });
  });
  // Keyboard: nothing is lit at first; the arrows light a plate (and move between them), Enter / Space press.
  window.addEventListener('keydown', (e) => {
    if (chosen || page.inert || !page.classList.contains('ready') || page.classList.contains('behind') || (e.code !== 'ArrowDown' && e.code !== 'ArrowUp')) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const down = e.code === 'ArrowDown';
    items[i < 0 ? (down ? 0 : items.length - 1) : (i + (down ? 1 : items.length - 1)) % items.length]?.focus();
  });
  return {
    ready,
    terrain: () => (chosen || !(canvas instanceof HTMLCanvasElement) ? null : canvas), // (still drawn beside the settings)
  };
}
