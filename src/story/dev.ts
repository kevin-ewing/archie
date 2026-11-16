// Development only: the Story desk on its own, no game behind it (story.html, `npm run dev:story`).
// Query: `?day=N` the campaign day, `?hours=H` freeze the watch (default: it runs on the device's clock), `?sortie=N`, `?resume`, `?log=N` fake logbook entries.
import { fitView } from '../render/display.ts';
import { campaignDate } from '../game/state.ts';
import { dayOfYear, sunsetHour } from '../sim/daylight.ts';
import { openBarn } from './barn.ts';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const day = Math.max(0, Math.floor(num('day', 9)));
const [year, month, date] = campaignDate(day).split('-').map(Number);
const now = new Date();
const view = () => fitView(innerWidth, innerHeight, devicePixelRatio || 1);
const sortie = Math.max(1, Math.floor(num('sortie', 1)));

const open = () =>
  openBarn({
    info: {
      day: date, month: MONTHS[month - 1], year, sortie, date: `${date} ${MONTHS[month - 1]} ${year}`,
      hours: num('hours', now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600), sunset: sunsetHour(dayOfYear({ day, hours: 0 })),
    },
    now: q.has('hours') ? () => num('hours', 0) : undefined, // `?hours=` freezes the watch; otherwise it runs
    resuming: q.has('resume'),
    log: Array.from({ length: Math.floor(num('log', 0)) }, (_, i) => ({ sortie: i + 1, date: `${date} ${MONTHS[month - 1]} ${year}`, minutes: 12 + i })),
    uiPx: () => view().uiScale / (devicePixelRatio || 1),
    gamePx: () => view().scale / (devicePixelRatio || 1),
    onSettings: (back) => back(), // no settings panel here
    onFly: () => console.log('FLY'),
    onClose: () => open(), // MAIN MENU: just reopen
  });
const setUi = () => document.documentElement.style.setProperty('--ui-px', `${view().uiScale / (devicePixelRatio || 1)}px`);
setUi();
addEventListener('resize', setUi);
open();
