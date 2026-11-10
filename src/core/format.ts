// Display formatting only (the money and date rules live in logic.ts).
import { getLang } from './i18n.ts';

// Dates and times follow the chosen language (Hindi writes the month names in Devanagari; Hinglish keeps the English ones).
const made = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = getLang() === 'hi' ? 'hi-IN' : 'en-IN';
  const k = `${locale}|${key}`;
  let f = made.get(k);
  if (!f) { f = new Intl.DateTimeFormat(locale, opts); made.set(k, f); }
  return f;
}
const dayMonth = () => fmt('dm', { day: 'numeric', month: 'short' });
const dayMonthYear = () => fmt('dmy', { day: 'numeric', month: 'short', year: 'numeric' });
const monthYear = () => fmt('my', { month: 'long', year: 'numeric' });
const clock = () => fmt('clock', { hour: '2-digit', minute: '2-digit' });

function parts(iso: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return [y, m, d];
}

export function shortDate(iso: string): string {
  const [y, m, d] = parts(iso);
  const date = new Date(y, m - 1, d);
  return (y === new Date().getFullYear() ? dayMonth() : dayMonthYear()).format(date);
}

export function monthLabel(key: string): string {
  const [y, m] = parts(`${key}-01`);
  return monthYear().format(new Date(y, m - 1, 1));
}

export function clockLabel(ms: number): string {
  return clock().format(new Date(ms));
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
