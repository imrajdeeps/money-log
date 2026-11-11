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
const dateTime = () => fmt('dt', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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

/** A moment as "11 Nov, 4:12 pm", in the chosen language. */
export function dateTimeLabel(ms: number): string {
  return dateTime().format(new Date(ms));
}

export function clockLabel(ms: number): string {
  return clock().format(new Date(ms));
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 1,23,456 as "₹1.2L", 4,50,00,000 as "₹4.5Cr", 12,300 as "₹12k": for places too small for the whole number. */
export function compactINR(n: number): string {
  const v = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(/\.0$/, '');
  const body = v >= 1e7 ? `${trim(v / 1e7)}Cr` : v >= 1e5 ? `${trim(v / 1e5)}L` : v >= 1e3 ? `${trim(v / 1e3)}k` : String(Math.round(v));
  return `${n < 0 ? '-' : ''}₹${body}`;
}

/** "Nov", from a month key like 2026-11, in the chosen language. */
export function monthShort(key: string): string {
  const [y, m] = parts(`${key}-01`);
  return fmt('ms', { month: 'short' }).format(new Date(y, m - 1, 1));
}

/** "Mon" ... "Sun" in the chosen language; 0 is Monday. */
export function weekdayShort(i: number): string {
  return fmt('wd', { weekday: 'short' }).format(new Date(2024, 0, 1 + i)); // 1 January 2024 was a Monday
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st: the day of the month in English; in Hindi and Hinglish just the number ("5 को"). */
export const ordinal = (n: number): string => getLang() !== 'en' ? String(n) : `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
