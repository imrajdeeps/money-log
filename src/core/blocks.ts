// Pure helpers for the plan blocks beyond the budget (Release 2): the due list, the calendar file and the net worth
// and goals snapshot. No DOM, no storage, no network, so the browser and the Node test runner share this file.
import { fmtINR, isValidDate, laterThan, parsePlanText, parseTs, round2, splitCsvLine } from './logic.ts';
import type { PlanData, PlanSummary } from './logic.ts';
import { tr } from './i18n.ts';

const MAX_AMOUNT = 1e9;

// ---------------------------------------------------------------- reading a pasted block
// Rows of trimmed cells from text pasted out of Excel (tab separated) or a CSV file. Blank lines are dropped.
function readRows(text: unknown): string[][] {
  const raw = String(text ?? '').replace(/^﻿/, '');
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.replace(/[\t, ]/g, '') !== '');
  const first = lines[0];
  if (first === undefined) return [];
  const tab = first.includes('\t');
  return lines.map((l) => (tab ? l.split('\t') : splitCsvLine(l)).map((c) => c.trim()));
}

const cellNumber = (s: string): number | null => {
  const t = s.replace(/[₹,\s]/g, '');
  if (t === '' || /^[-–—]$/.test(t)) return 0;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

// ---------------------------------------------------------------- due list
export type DueKind = 'oneoff' | 'todo';
export interface DueItem {
  k: string; // stable key, so a Done mark survives re-importing the same item
  kind: DueKind;
  title: string;
  due: string | null; // YYYY-MM-DD, or null when the to-do has no date
  amount: number | null; // rupees, one-off payments only
  done: boolean; // the status in the spreadsheet at import time
}
export interface DueData { v: 1; items: DueItem[] }
export interface DueBlock extends DueData { importedAt: string; dirty: 0 | 1 }
export interface DueSummary { oneoffs: number; todos: number; undated: number }

export const dueKey = (kind: DueKind, title: string, due: string | null): string => `${kind}|${due ?? ''}|${title.toLowerCase()}`;

const MAX_DUE = 200;
const MAX_TITLE = 120;

export type DueParse = { ok: true; data: DueData; summary: DueSummary } | { ok: false; error: string };

export function parseDueText(text: unknown): DueParse {
  const fail = (error: string): DueParse => ({ ok: false, error });
  const rows = readRows(text);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const iKind = head.indexOf('kind');
  const iTitle = head.indexOf('title');
  const iDue = head.indexOf('due');
  const iAmount = head.indexOf('amount');
  const iStatus = head.indexOf('status');
  if (iKind < 0 || iTitle < 0 || iDue < 0) return fail('The header row must contain Kind, Title and Due. Copy from the header row (row 38) of the App export tab.');

  const items: DueItem[] = [];
  const seen = new Set<string>();
  for (const c of rows.slice(1)) {
    const title = c[iTitle] ?? '';
    if (title === '') continue; // an unused slot in the sheet
    if (title.length > MAX_TITLE) return fail(`"${title.slice(0, 20)}…" is longer than ${MAX_TITLE} characters.`);
    const kindText = (c[iKind] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const kind: DueKind | null = kindText === 'oneoff' ? 'oneoff' : kindText === 'todo' ? 'todo' : null;
    if (!kind) return fail(`"${title}": kind "${c[iKind] ?? ''}" must be oneoff or todo.`);
    const dueText = c[iDue] ?? '';
    if (dueText !== '' && !isValidDate(dueText)) return fail(`"${title}": the date "${dueText}" must look like 2027-09-30.`);
    const due = dueText === '' ? null : dueText;
    let amount: number | null = null;
    if (iAmount >= 0) {
      const n = cellNumber(c[iAmount] ?? '');
      if (n === null || n < 0 || n >= MAX_AMOUNT) return fail(`"${title}": "${c[iAmount]}" is not a valid amount.`);
      amount = n > 0 ? round2(n) : null;
    }
    const done = iStatus >= 0 && (c[iStatus] ?? '').toLowerCase() === 'done';
    const base = dueKey(kind, title, due);
    let k = base;
    for (let n = 2; seen.has(k); n++) k = `${base}#${n}`;
    seen.add(k);
    items.push({ k, kind, title, due, amount, done });
  }
  if (!items.length) return fail('No due items found under the header.');
  if (items.length > MAX_DUE) return fail(`Too many items (limit ${MAX_DUE}).`);
  return {
    ok: true,
    data: { v: 1, items },
    summary: { oneoffs: items.filter((i) => i.kind === 'oneoff').length, todos: items.filter((i) => i.kind === 'todo').length, undated: items.filter((i) => !i.due).length },
  };
}

// Validate a due list that comes from the server or a backup (already parsed JSON).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanDue(p: any): DueData | null {
  if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.items) || p.items.length > MAX_DUE) return null;
  const items: DueItem[] = [];
  const seen = new Set<string>();
  for (const i of p.items) {
    if (!i || typeof i.k !== 'string' || !i.k || i.k.length > 400 || seen.has(i.k)) return null;
    if (i.kind !== 'oneoff' && i.kind !== 'todo') return null;
    if (typeof i.title !== 'string' || !i.title || i.title.length > MAX_TITLE) return null;
    if (i.due !== null && !isValidDate(i.due)) return null;
    if (i.amount !== null && !(typeof i.amount === 'number' && Number.isFinite(i.amount) && i.amount > 0 && i.amount < MAX_AMOUNT)) return null;
    seen.add(i.k);
    items.push({ k: i.k, kind: i.kind, title: i.title, due: i.due, amount: i.amount, done: i.done === true });
  }
  return { v: 1, items };
}

// The marks made in the app on items of the due list: Done, and Removed (x = 1, the swipe-to-delete). Per key, the latest
// change wins, on every phone alike. A mark made after the list was imported wins over the spreadsheet; importing the list
// again brings back what was removed, like everything else the import replaces.
export type DoneMap = Record<string, { d: 0 | 1; t: string; x?: 1 }>;

export function setDone(map: DoneMap, key: string, done: boolean, nowIso: string): DoneMap {
  const prev = map[key];
  return { ...map, [key]: { d: done ? 1 : 0, t: prev ? laterThan(prev.t, nowIso) : nowIso } };
}

// Removes an item from the list (Done stays as it was, in case the item comes back with a new import).
export function removeDue(map: DoneMap, key: string, nowIso: string): DoneMap {
  const prev = map[key];
  return { ...map, [key]: { d: prev?.d ?? 0, t: prev ? laterThan(prev.t, nowIso) : nowIso, x: 1 } };
}

export function mergeDone(local: DoneMap, remote: DoneMap): DoneMap {
  const out: DoneMap = { ...remote };
  for (const [k, v] of Object.entries(local)) {
    const r = out[k];
    if (!r || parseTs(v.t) >= parseTs(r.t)) out[k] = v;
  }
  return out;
}

export const sameDone = (a: DoneMap, b: DoneMap): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] && b[k].d === a[k]!.d && b[k].t === a[k]!.t && (b[k].x ?? 0) === (a[k]!.x ?? 0));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanDoneMap(p: any): DoneMap {
  const out: DoneMap = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (k.length > 400 || !v || (v.d !== 0 && v.d !== 1) || !Number.isFinite(parseTs(v.t))) continue;
    out[k] = v.x === 1 ? { d: v.d, t: v.t, x: 1 } : { d: v.d, t: v.t };
    if (Object.keys(out).length >= 1000) break;
  }
  return out;
}

// Keep only the marks for items that are still in the list, so the map does not grow for ever.
export function pruneDone(map: DoneMap, items: DueItem[]): DoneMap {
  const keep = new Set(items.map((i) => i.k));
  return Object.fromEntries(Object.entries(map).filter(([k]) => keep.has(k)));
}

// A mark made in the app after the list was imported wins; otherwise the spreadsheet's status stands.
export function isDone(item: DueItem, map: DoneMap, importedAt: string): boolean {
  const m = map[item.k];
  return m && parseTs(m.t) > parseTs(importedAt) ? m.d === 1 : item.done;
}

// Removed in the app after the list was imported.
export function isRemoved(item: DueItem, map: DoneMap, importedAt: string): boolean {
  const m = map[item.k];
  return m !== undefined && m.x === 1 && parseTs(m.t) > parseTs(importedAt);
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'nodate' | 'done';
export interface DueView extends DueItem { isDone: boolean; state: DueState; days: number | null }

export function daysBetween(fromIso: string, toIso: string): number {
  const t = (s: string) => { const [y = 0, m = 1, d = 1] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(toIso) - t(fromIso)) / 86400000);
}

const RANK: Record<DueState, number> = { overdue: 0, today: 1, soon: 2, later: 3, nodate: 4, done: 5 };

// Overdue first (oldest first), then by date; undated items after dated ones; finished items last.
export function classifyDue(items: DueItem[], map: DoneMap, importedAt: string, todayIso: string, soonDays = 14): DueView[] {
  const views = items.filter((i) => !isRemoved(i, map, importedAt)).map((i): DueView => {
    const done = isDone(i, map, importedAt);
    const days = i.due ? daysBetween(todayIso, i.due) : null;
    const state: DueState = done ? 'done' : days === null ? 'nodate' : days < 0 ? 'overdue' : days === 0 ? 'today' : days <= soonDays ? 'soon' : 'later';
    return { ...i, isDone: done, state, days };
  });
  return views.sort((a, b) =>
    RANK[a.state] - RANK[b.state]
    || (a.due ?? '9999').localeCompare(b.due ?? '9999')
    || a.title.localeCompare(b.title));
}

export function dueRelative(days: number | null): string {
  if (days === null) return tr('no date');
  if (days === 0) return tr('today');
  if (days === 1) return tr('tomorrow');
  if (days === -1) return tr('yesterday');
  return days > 0 ? tr('in {0} days', days) : tr('{0} days ago', -days);
}

// ---------------------------------------------------------------- calendar file (.ics)
export interface AlertPrefs { daysBefore: number; hour: number }
export const DEFAULT_ALERT: AlertPrefs = { daysBefore: 2, hour: 9 };

export function cleanAlert(p: unknown): AlertPrefs {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<AlertPrefs>;
  const d = Number.isInteger(o.daysBefore) && o.daysBefore! >= 0 && o.daysBefore! <= 30 ? o.daysBefore! : DEFAULT_ALERT.daysBefore;
  const h = Number.isInteger(o.hour) && o.hour! >= 0 && o.hour! <= 23 ? o.hour! : DEFAULT_ALERT.hour;
  return { daysBefore: d, hour: h };
}

// The alert is set relative to the start of the due date (midnight, local time): "2 days before at 9:00" is 39 hours
// before it. An alert on the day itself (0 days before) lands after the start, which iCalendar allows.
export function alertTrigger(p: AlertPrefs): string {
  const hoursBefore = p.daysBefore * 24 - p.hour;
  if (hoursBefore === 0) return 'PT0S';
  const n = Math.abs(hoursBefore);
  const days = Math.floor(n / 24);
  const rem = n % 24;
  return `${hoursBefore < 0 ? '' : '-'}P${days ? `${days}D` : ''}${rem ? `T${rem}H` : ''}`;
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\n|\r/g, '\\n');
const icsDate = (iso: string) => iso.replace(/-/g, '');

// Lines longer than 75 bytes must be folded: CRLF plus one space. Never split a multi-byte character.
function fold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ` ${l}` : l));
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// One all-day event per dated, unfinished item, each with a display alert. The UID depends only on the item, so
// opening the file again updates the same events instead of adding copies.
export function buildIcs(items: DueView[], prefs: AlertPrefs, nowIso: string): string {
  const stampUtc = nowIso.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Money Log//Due list//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const i of items) {
    if (!i.due || i.isDone) continue;
    const next = new Date(Date.UTC(Number(i.due.slice(0, 4)), Number(i.due.slice(5, 7)) - 1, Number(i.due.slice(8, 10)) + 1));
    const nextIso = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
    const what = i.kind === 'oneoff' ? tr('One-off payment') : tr('To-do');
    const summary = i.amount ? `${i.title} (${fmtINR(i.amount)})` : i.title;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${hash(i.k)}${hash(i.k + i.title)}@money-log`,
      `DTSTAMP:${stampUtc}`,
      `DTSTART;VALUE=DATE:${icsDate(i.due)}`,
      `DTEND;VALUE=DATE:${nextIso}`,
      `SUMMARY:${icsText(summary)}`,
      `DESCRIPTION:${icsText(tr('{0} from your Money Log plan.', what))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(summary)}`,
      `TRIGGER:${alertTrigger(prefs)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- net worth and goals snapshot
export type NetUnit = '₹' | '%' | 'years';
export interface NetItem { label: string; value: number; unit: NetUnit }
export interface NetData { v: 1; asOf: string | null; items: NetItem[] }
export interface NetBlock extends NetData { importedAt: string; dirty: 0 | 1 }
export interface NetSummary { items: number; asOf: string | null }

export type NetParse = { ok: true; data: NetData; summary: NetSummary } | { ok: false; error: string };

const MAX_NET = 40;
const unitOf = (s: string): NetUnit | 'date' | null => {
  const t = s.toLowerCase().replace(/\s/g, '');
  if (t === '₹' || t === 'rs' || t === 'inr') return '₹';
  if (t === '%' || t === 'percent') return '%';
  if (t === 'years' || t === 'year' || t === 'yrs') return 'years';
  return t === 'date' ? 'date' : null;
};

export function parseNetText(text: unknown): NetParse {
  const fail = (error: string): NetParse => ({ ok: false, error });
  const rows = readRows(text);
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const iLabel = head.indexOf('label');
  const iValue = head.indexOf('value');
  const iUnit = head.indexOf('unit');
  if (iLabel < 0 || iValue < 0 || iUnit < 0) return fail('The header row must contain Label, Value and Unit. Copy from the header row (row 70) of the App export tab.');
  const items: NetItem[] = [];
  let asOf: string | null = null;
  for (const c of rows.slice(1)) {
    const label = c[iLabel] ?? '';
    if (label === '') continue;
    if (label.length > 80) return fail(`"${label.slice(0, 20)}…" is longer than 80 characters.`);
    const unit = unitOf(c[iUnit] ?? '');
    if (!unit) return fail(`"${label}": unit "${c[iUnit] ?? ''}" must be ₹, %, years or date.`);
    const raw = c[iValue] ?? '';
    if (unit === 'date') {
      if (!isValidDate(raw)) return fail(`"${label}": the date "${raw}" must look like 2026-11-01.`);
      asOf ??= raw;
      continue;
    }
    const n = cellNumber(raw);
    if (n === null || Math.abs(n) >= 1e12) return fail(`"${label}": "${raw}" is not a valid number.`);
    items.push({ label, value: round2(n), unit });
  }
  if (!items.length) return fail('No figures found under the header.');
  if (items.length > MAX_NET) return fail(`Too many rows (limit ${MAX_NET}).`);
  return { ok: true, data: { v: 1, asOf, items }, summary: { items: items.length, asOf } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanNet(p: any): NetData | null {
  if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.items) || !p.items.length || p.items.length > MAX_NET) return null;
  if (p.asOf !== null && p.asOf !== undefined && !isValidDate(p.asOf)) return null;
  const items: NetItem[] = [];
  for (const i of p.items) {
    if (!i || typeof i.label !== 'string' || !i.label || i.label.length > 80) return null;
    if (i.unit !== '₹' && i.unit !== '%' && i.unit !== 'years') return null;
    if (typeof i.value !== 'number' || !Number.isFinite(i.value) || Math.abs(i.value) >= 1e12) return null;
    items.push({ label: i.label, value: i.value, unit: i.unit });
  }
  return { v: 1, asOf: p.asOf ?? null, items };
}

export function fmtNet(i: NetItem): string {
  if (i.unit === '₹') return fmtINR(i.value);
  if (i.unit === '%') return `${i.value}%`;
  return `${i.value} ${i.value === 1 ? 'year' : 'years'}`;
}

// ---------------------------------------------------------------- one entry point for any pasted block
export type BlockParse =
  | { ok: true; kind: 'budget'; plan: PlanData; summary: PlanSummary }
  | { ok: true; kind: 'due'; data: DueData; summary: DueSummary }
  | { ok: true; kind: 'networth'; data: NetData; summary: NetSummary }
  | { ok: false; error: string };

// The first header cell tells the blocks apart: Category (budget), Kind (due list), Label (net worth and goals).
export function parseBlockText(text: unknown): BlockParse {
  const first = (readRows(text)[0]?.[0] ?? '').toLowerCase();
  if (first === 'category') { const r = parsePlanText(text); return r.ok ? { ok: true, kind: 'budget', plan: r.plan, summary: r.summary } : r; }
  if (first === 'kind') { const r = parseDueText(text); return r.ok ? { ok: true, kind: 'due', data: r.data, summary: r.summary } : r; }
  if (first === 'label') { const r = parseNetText(text); return r.ok ? { ok: true, kind: 'networth', data: r.data, summary: r.summary } : r; }
  if (first === '') return { ok: false, error: "Nothing to import. Copy a block from the spreadsheet's App export tab." };
  return { ok: false, error: 'This does not look like one of the App export blocks. The first header cell must be Category, Kind or Label.' };
}
