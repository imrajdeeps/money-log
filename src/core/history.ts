// Pure helpers for the edit history of shared expenses (Release 3): checking what the server sends and turning it into
// sentences. No DOM, storage or network.
import { fmtINR, isValidDate, parseTs } from './logic.ts';
import { tr } from './i18n.ts';

export type HistoryKind = 'created' | 'edited' | 'deleted' | 'moved';
export interface HistoryRow {
  id: string;
  entry_id: string;
  group_id: string;
  changed_by: string;
  changed_at: string;
  kind: HistoryKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changes: Record<string, any>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanHistory(r: any): HistoryRow | null {
  if (!r || ![r.id, r.entry_id, r.group_id, r.changed_by].every((x) => typeof x === 'string' && UUID_RE.test(x))) return null;
  if (!['created', 'edited', 'deleted', 'moved'].includes(r.kind)) return null;
  if (!Number.isFinite(parseTs(r.changed_at))) return null;
  if (!r.changes || typeof r.changes !== 'object' || Array.isArray(r.changes)) return null;
  return { id: r.id.toLowerCase(), entry_id: r.entry_id.toLowerCase(), group_id: r.group_id.toLowerCase(), changed_by: r.changed_by.toLowerCase(), changed_at: r.changed_at, kind: r.kind, changes: r.changes };
}

const money = (v: unknown): string => (typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) ? fmtINR(Number(v)) : '?');
const quoted = (v: unknown): string => (typeof v === 'string' && v !== '' ? `“${v}”` : 'nothing');
const day = (v: unknown): string => (typeof v === 'string' && isValidDate(v) ? new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '?');

// What each person owes, as "Asha ₹100, Ravi ₹500".
function split(shares: unknown, name: (uid: string) => string): string {
  if (!shares || typeof shares !== 'object') return 'nobody';
  const parts = Object.entries(shares as Record<string, unknown>).filter(([, v]) => Number(v) > 0).map(([uid, v]) => `${name(uid)} ${money(v)}`);
  return parts.length ? parts.join(', ') : 'nobody';
}

// One line per thing that happened, in plain words. `name` turns a user id into the name shown in the group.
type Names = (uid: string) => string;
const nameOrQuestion = (v: unknown, name: Names): string => (typeof v === 'string' ? name(v) : '?');

function describeCreated(c: HistoryRow['changes'], name: Names): string[] {
  const first = [money(c.amount), typeof c.category === 'string' ? c.category : null, c.note ? quoted(c.note) : null].filter(Boolean).join(' · ');
  const lines = [tr('Added: {0}', first)];
  if (typeof c.paid_by === 'string') lines.push(tr('Paid by {0}', name(c.paid_by)));
  if (c.shares) lines.push(tr('Split: {0}', split(c.shares, name)));
  return lines;
}

function describeEdited(row: HistoryRow, name: Names): string[] {
  const c = row.changes;
  const lines: string[] = [];
  if (c.amount) lines.push(tr('Amount {0} → {1}', money(c.amount.from), money(c.amount.to)));
  if (c.category) lines.push(tr('Category {0} → {1}', quoted(c.category.from), quoted(c.category.to)));
  if (c.note) lines.push(tr('Note {0} → {1}', quoted(c.note.from), quoted(c.note.to)));
  if (c.entry_date) lines.push(tr('Date {0} → {1}', day(c.entry_date.from), day(c.entry_date.to)));
  if (c.paid_by) lines.push(tr('Paid by {0} → {1}', nameOrQuestion(c.paid_by.from, name), nameOrQuestion(c.paid_by.to, name)));
  if (c.shares) lines.push(tr('Split now: {0}', split(c.shares.to, name)));
  if (row.kind === 'deleted') lines.push('Deleted');
  return lines.length ? lines : ['Changed'];
}

export function describeHistory(row: HistoryRow, name: Names): string[] {
  if (row.kind === 'moved') return [tr('Taken out of this group')];
  return row.kind === 'created' ? describeCreated(row.changes, name) : describeEdited(row, name);
}
