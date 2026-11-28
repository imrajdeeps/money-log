// The words around a repeat in a group (version 2.2), from the design: the line under its name, its tag, and what its card says
// once a month is logged or skipped. Kept apart from the components so the cards stay short.
import { monthName, ordinal, shortDate } from '../../core/format.ts';
import type { GroupRepeat, RepeatState } from '../../core/groupRepeats.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

type NameOf = (uid: string) => string;

/** What a repeat is called: its note, or its category. */
export const repeatName = (r: Pick<GroupRepeat, 'note' | 'category'>): string => r.note || r.category;

/** "You ₹9,000, Aakash ₹6,000": you first, then the others in the order they were set. */
export function sharesText(r: Pick<GroupRepeat, 'shares'>, me: string, nameOf: NameOf): string {
  const ids = Object.keys(r.shares).sort((a, b) => Number(b === me) - Number(a === me));
  return ids.map((id) => `${id === me ? tr('You') : nameOf(id)} ${fmtINR(r.shares[id]!)}`).join(', ');
}

/** "On the 1st · you pay · You ₹9,000, Aakash ₹6,000" */
export function repeatLine(r: GroupRepeat, me: string, nameOf: NameOf): string {
  const payer = r.paid_by === me ? tr('you pay') : tr('{0} pays', nameOf(r.paid_by));
  return tr('On the {0} · {1} · {2}', ordinal(r.day), payer, sharesText(r, me, nameOf));
}

/** "You pay · You ₹9,000, Aakash ₹6,000", at the top of its sheet. */
export function payerLine(r: GroupRepeat, me: string, nameOf: NameOf): string {
  return `${r.paid_by === me ? tr('You pay') : tr('{0} pays', nameOf(r.paid_by))} · ${sharesText(r, me, nameOf)}`;
}

/** The tag beside its name, with its tone. */
export function repeatTag(s: RepeatState): { text: string; tone: 'warn' | 'good' | 'plain' } {
  if (s.kind === 'due') return { text: s.today ? tr('Due today') : tr('Due since {0}', shortDate(s.date)), tone: 'warn' };
  if (s.kind === 'upcoming') return { text: tr('Next on {0}', shortDate(s.date)), tone: 'plain' };
  if (s.kind === 'logged') return { text: tr('{0} logged', monthName(s.month)), tone: 'good' };
  if (s.kind === 'skipped') return { text: tr('{0} skipped', monthName(s.month)), tone: 'plain' };
  return { text: tr('{0} done', monthName(s.month)), tone: 'plain' };
}

// "you paid ₹15,000, and you are owed ₹6,000" / "Aakash paid ₹15,000, and your share is ₹6,000": the money side of a logged month.
function moneyText(paidBy: string, amount: number, mine: number | undefined, me: string, nameOf: NameOf): string {
  if (paidBy === me) {
    const owed = amount - (mine ?? 0);
    return owed > 0 ? tr('you paid {0}, and you are owed {1}', fmtINR(amount), fmtINR(owed)) : tr('you paid {0}', fmtINR(amount));
  }
  const paid = tr('{0} paid {1}', nameOf(paidBy), fmtINR(amount));
  return mine === undefined ? paid : `${paid}, ${tr('and your share is {0}', fmtINR(mine))}`;
}

/** What the card says once this month is done, with the next date. */
export function doneText(s: Exclude<RepeatState, { kind: 'due' } | { kind: 'upcoming' }>, me: string, nameOf: NameOf): string {
  const next = tr('Next on {0}.', shortDate(s.next));
  if (s.kind === 'logged') {
    const e = s.entry;
    const day = shortDate(isoDate(new Date(e.created_at)));
    const who = e.owner_id === me ? tr('You logged it on {0}', day) : tr('{0} logged it on {1}', nameOf(e.owner_id ?? ''), day);
    return `${who}: ${moneyText(e.paid_by ?? '', e.amount, e.shares?.[me], me, nameOf)}. ${next}`;
  }
  if (s.kind === 'skipped') {
    const skipped = s.by === me ? tr('You skipped {0}.', monthName(s.month)) : tr('{0} skipped {1}.', nameOf(s.by ?? ''), monthName(s.month));
    return `${skipped} ${next}`;
  }
  return `${tr('{0} is done.', monthName(s.month))} ${next}`;
}

/** Under Log and Skip: who can log it, and that it counts once. */
export function dueNote(people: number, month: string): string {
  const first = people === 2
    ? tr('Either of you can log it, and it counts once for {0}, whoever taps first.', monthName(month))
    : tr('Anyone in it can log it, and it counts once for {0}, whoever taps first.', monthName(month));
  return `${first} ${tr('Paid a different amount this month? Log it, then change that expense.')}`;
}

/** How many people are in a repeat: its payer and everyone with a share. */
export const peopleIn = (r: Pick<GroupRepeat, 'paid_by' | 'shares'>): number => new Set([r.paid_by, ...Object.keys(r.shares)]).size;

/** The HTTP status of a refusal from the server (0 when there is none, or it is not a refusal). */
export const errorStatus = (e: unknown): number => (typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : 0);

/** A server refusal or a lost connection, in words for the card. */
export function repeatError(e: unknown, month: string): string {
  if (errorStatus(e) === 409) return tr('{0} is already done: someone in it got there first.', monthName(month));
  const m = e instanceof Error ? e.message : String(e);
  return m === 'No connection' ? tr('You are offline. Logging, skipping and changing a repeat need a connection.') : m;
}
