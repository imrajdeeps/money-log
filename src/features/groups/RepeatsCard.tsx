import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { activeRepeats, inRepeat, repeatState } from '../../core/groupRepeats.ts';
import type { GroupRepeat, RepeatState } from '../../core/groupRepeats.ts';
import { monthName } from '../../core/format.ts';
import type { Group } from '../../core/groups.ts';
import { fmtINR, isoDate, newId } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { doneText, dueNote, errorStatus, peopleIn, repeatError, repeatLine, repeatName, repeatTag } from './repeatText.ts';
import { RepeatSheet } from './RepeatSheet.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// "Every month" on a group page (version 2.2, from the design): what repeats in the group, what is due, and Log or Skip for the
// people in it. The server does each change, so a month counts once whoever taps first.

const TAG = { warn: 'bg-warn-bg text-warn', good: 'bg-good-bg text-good', plain: 'bg-press text-ink' } as const;

// Log December and Skip this month, with the note under them; or, for someone not in it (or in a closed trip), why not.
function DueActions({ r, s, mine, closed }: Readonly<{ r: GroupRepeat; s: Extract<RepeatState, { kind: 'due' }>; mine: boolean; closed: boolean }>) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entryId] = useState(newId); // the same id on a retry, so a log whose answer was lost counts as done, not as someone else's
  if (closed) return <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('This trip is closed, so nothing more is logged.')}</p>;
  if (!mine) return <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('Only the people in it can log it.')}</p>;
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setError('');
    try { await fn(); app.toast(done); } catch (e) {
      setError(repeatError(e, s.month));
      if (errorStatus(e) === 409) app.syncNow(); // someone else got there first: show what they did
    } finally { setBusy(false); }
  };
  const month = monthName(s.month);
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={ui.btn('solid', 'none', 'min-h-11 px-[18px] text-[15px]')} disabled={busy}
          onClick={() => void run(() => app.logGroupRepeat(r.id, s.month, entryId), tr('Logged {0} for {1}', repeatName(r), month))}>{tr('Log {0}', month)}</button>
        <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-4 text-[15px]')} disabled={busy}
          onClick={() => void run(() => app.skipGroupRepeat(r.id, s.month), tr('Skipped {0} for {1}', repeatName(r), month))}>{tr('Skip this month')}</button>
      </div>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <p className="m-0 text-[13px] leading-[18px] text-muted">{dueNote(peopleIn(r), s.month)}</p>
    </>
  );
}

function RepeatCard({ r, entries, me, closed, nameOf, onMore }: Readonly<{ r: GroupRepeat; entries: readonly Entry[]; me: string; closed: boolean; nameOf: (uid: string) => string; onMore: () => void }>) {
  const s = repeatState(r, isoDate(), entries);
  const mine = inRepeat(r, me);
  const tag = repeatTag(s);
  return (
    <div className={ui.cx('bg-card rounded-card px-4 py-3.5 flex flex-col gap-2.5', s.kind === 'due' ? 'border-[1.5px] border-accent' : 'border border-line')}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_44px] gap-2 items-center">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="flex items-center gap-2 flex-wrap"><span className="text-[17px] font-bold">{repeatName(r)}</span><span className={ui.cx('text-[12px] font-[650] px-2 py-0.5 rounded-md', TAG[tag.tone])}>{tag.text}</span></span>
          <span className="text-[13px] leading-[18px] text-muted">{repeatLine(r, me, nameOf)}</span>
        </span>
        <span className="text-[17px] font-bold tabular-nums">{fmtINR(r.amount)}</span>
        <button type="button" className="w-11 h-11 rounded-xl flex items-center justify-center border-0 bg-transparent text-muted cursor-pointer" aria-label={mine ? tr('Change, skip or stop {0}', repeatName(r)) : tr('More about {0}', repeatName(r))} onClick={onMore}><Icon name="dots" size={22} stroke={3} /></button>
      </div>
      {s.kind === 'due' && <DueActions key={s.month} r={r} s={s} mine={mine} closed={closed} />}
      {s.kind !== 'due' && s.kind !== 'upcoming' && <span className="text-[14px] leading-5">{doneText(s, me, nameOf)}</span>}
    </div>
  );
}

export function RepeatsCard({ group, me, nameOf }: Readonly<{ group: Group; me: string; nameOf: (uid: string) => string }>) {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const list = activeRepeats(app.groupRepeats, group.id);
  const sheet = list.find((r) => r.id === open);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="repeats-h" className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <h3 id="repeats-h" className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Every month')}</h3>
        <span className="text-[14px] text-muted">{list.length === 1 ? tr('1 repeat') : tr('{0} repeats', list.length)}</span>
      </div>
      {list.map((r) => <RepeatCard key={r.id} r={r} entries={app.groupEntries} me={me} closed={group.closed_at !== null} nameOf={nameOf} onMore={() => setOpen(r.id)} />)}
      {sheet && <RepeatSheet key={sheet.id} r={sheet} group={group} me={me} nameOf={nameOf} onClose={() => setOpen(null)} />}
    </section>
  );
}
