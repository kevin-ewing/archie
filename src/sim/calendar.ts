// Calendar dates for the campaign clock. Pure integer arithmetic (days-from-civil,
// proleptic Gregorian): no Date, no time zone, no wall clock.

export type CalDate = { year: number; month: number; day: number }; // month 1–12

export const REFERENCE: CalDate = { year: 1915, month: 5, day: 10 };

export class CalendarError extends Error {
  field: 'year' | 'month' | 'day' | 'format';
  constructor(field: 'year' | 'month' | 'day' | 'format', message: string) {
    super(message);
    this.name = 'CalendarError';
    this.field = field;
  }
}

const EPOCH_1900 = 25567; // days from 1900-01-01 to 1970-01-01
const CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => (m === 2 ? (isLeap(y) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);

function validate(d: CalDate): void {
  if (!Number.isInteger(d.year)) throw new CalendarError('year', `invalid year: ${d.year}`);
  if (!Number.isInteger(d.month) || d.month < 1 || d.month > 12) throw new CalendarError('month', `invalid month: ${d.month}`);
  if (!Number.isInteger(d.day) || d.day < 1 || d.day > daysIn(d.year, d.month)) {
    throw new CalendarError('day', `invalid day: ${d.day} (${d.year}-${d.month})`);
  }
}

/** Days since 1900-01-01. Throws CalendarError for an invalid date. */
export function dayNumber(d: CalDate): number {
  validate(d);
  const y = d.month <= 2 ? d.year - 1 : d.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (d.month + (d.month > 2 ? -3 : 9)) + 2) / 5) + d.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468 + EPOCH_1900;
}

export function fromDayNumber(n: number): CalDate {
  if (!Number.isInteger(n)) throw new CalendarError('day', `day number is not an integer: ${n}`);
  const z = n - EPOCH_1900 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** The date of campaign day 0 for callers that pass no `start`: REFERENCE, unless a debug `?date=` moved it. */
let campaignStart: CalDate = REFERENCE;
export function setCampaignStart(d: CalDate): void {
  campaignStart = d;
}
/** Calendar date of a campaign day (any integer, negative allowed); day 0 is `start`. */
export function dateOf(clockDay: number, start: CalDate = campaignStart): CalDate {
  if (!Number.isInteger(clockDay)) throw new CalendarError('day', `campaign day is not an integer: ${clockDay}`);
  return fromDayNumber(dayNumber(start) + clockDay);
}

/** 1..366 */
export function dayOfYear(d: CalDate): number {
  validate(d);
  return CUMULATIVE[d.month - 1] + d.day + (d.month > 2 && isLeap(d.year) ? 1 : 0);
}

export function parseISO(s: string): CalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new CalendarError('format', `expected YYYY-MM-DD, got "${s}"`);
  const d = { year: +m[1], month: +m[2], day: +m[3] };
  validate(d);
  return d;
}

export function formatISO(d: CalDate): string {
  validate(d);
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return `${p(d.year, 4)}-${p(d.month, 2)}-${p(d.day, 2)}`;
}
