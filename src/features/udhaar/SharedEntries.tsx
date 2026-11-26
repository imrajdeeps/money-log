import { useApp } from '../../data/context.tsx';
import { useProfile } from '../../data/useProfile.ts';
import { myUpi } from '../../data/phonePrefs.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import { udhaarRemindText } from '../../core/upi.ts';
import type { SharedUdhaar } from '../../core/sharedUdhaar.ts';
import { WhatsAppButton } from '../../ui/WhatsAppButton.tsx';
import { EntryCard, SettledLine } from './EntryCard.tsx';
import * as us from './udhaarStyles.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

type Act = (run: () => Promise<void>, done: string) => void;

// Runs a call to the server, then says what happened (or what went wrong) and reads the entries again.
function useAct(onChanged: () => void): Act {
  const app = useApp();
  return (run, done) => {
    run().then(() => { app.toast(done); onChanged(); }).catch((e: unknown) => app.toast(e instanceof Error ? e.message : String(e)));
  };
}

const wayWords = (e: SharedUdhaar): string => (e.way === 'gave' ? tr('You lent') : tr('You borrowed'));

// The tag under a shared entry: whether the other person accepted, or is still to answer.
function tag(e: SharedUdhaar): { text: string; tone: 'good' | 'wait' | 'plain' } {
  if (e.state === 'invited') return { text: tr('Shared · waiting for {0} to accept', e.who), tone: 'wait' };
  return { text: e.mine ? tr('Shared with {0} · accepted', e.who) : tr('Shared by {0}', e.who), tone: 'good' };
}

// One open shared entry: Settled once accepted, Remind when they owe you, Delete for the writer while it is not yet accepted.
export function SharedRow({ e, onChanged }: Readonly<{ e: SharedUdhaar; onChanged: () => void }>) {
  const app = useApp();
  const profile = useProfile();
  const upi = myUpi.use();
  const act = useAct(onChanged);
  const canDelete = e.mine && e.state !== 'active';
  return (
    <EntryCard who={e.who} sub={[wayWords(e), shortDate(e.date), e.note].filter(Boolean).join(' · ')} amount={e.amount} lent={e.way === 'gave'} tag={tag(e)}>
      {e.state === 'active' && <button type="button" className={us.action('primary')} onClick={() => act(() => app.sharedUdhaar.settle(e.id, true), tr('Marked as settled'))}>{tr('Settled')}</button>}
      {e.way === 'gave' && <WhatsAppButton size="entry" label={tr('Remind on WhatsApp')} text={udhaarRemindText({ name: e.who, amount: e.amount, upi, payeeName: profile.name || 'Me' })} />}
      {canDelete && <button type="button" className={us.action('bad')} onClick={() => { if (window.confirm(tr('Delete this entry with {0}? It goes for both of you. This cannot be undone.', e.who))) act(() => app.sharedUdhaar.remove(e.id), tr('Removed: {0}', e.who)); }}>{tr('Delete')}</button>}
    </EntryCard>
  );
}

// A settled shared entry in a line, with Open again.
export function SharedSettled({ e, onChanged }: Readonly<{ e: SharedUdhaar; onChanged: () => void }>) {
  const app = useApp();
  const act = useAct(onChanged);
  const words = e.way === 'gave' ? tr('{0} · you lent {1} · shared', e.who, fmtINR(e.amount)) : tr('{0} · you borrowed {1} · shared', e.who, fmtINR(e.amount));
  return <SettledLine text={words} onOpen={() => act(() => app.sharedUdhaar.settle(e.id, false), tr('Opened again'))} />;
}

// Entries someone in your Circle shared with you: they count only once you accept.
export function SharedAnswers({ list, onChanged }: Readonly<{ list: readonly SharedUdhaar[]; onChanged: () => void }>) {
  const app = useApp();
  const act = useAct(onChanged);
  if (list.length === 0) return null;
  return (
    <>
      {list.map((e) => (
        <section key={e.id} className="bg-press rounded-card px-4 py-3.5 flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{tr('Shared with you')}</span>
          <span className="text-[15px] leading-[22px]"><strong>{e.who}</strong> {e.way === 'took' ? tr('added an entry: they lent you {0} on {1}', fmtINR(e.amount), shortDate(e.date)) : tr('added an entry: you lent them {0} on {1}', fmtINR(e.amount), shortDate(e.date))}{e.note ? `, ${tr('for {0}', e.note)}.` : '.'}</span>
          <span className="text-[13px] text-muted">{tr('Not counted until you accept. {0} sees your answer.', e.who)}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.btn('solid', 'none', 'min-h-11 px-4 text-[15px]')} onClick={() => act(() => app.sharedUdhaar.answer(e.id, true), tr('Accepted'))}>{tr('Accept')}</button>
            <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-3.5 text-[15px]')} onClick={() => act(() => app.sharedUdhaar.answer(e.id, false), tr('Told {0} it is not right', e.who))}>{tr('That is not right')}</button>
          </div>
        </section>
      ))}
    </>
  );
}

// Entries you shared that the other person said are not right: say so, and let the writer delete them.
export function SharedDeclined({ list, onChanged }: Readonly<{ list: readonly SharedUdhaar[]; onChanged: () => void }>) {
  const app = useApp();
  const act = useAct(onChanged);
  if (list.length === 0) return null;
  return (
    <ul className="list-none m-0 px-4 bg-card border border-line rounded-card [&>li+li]:border-t [&>li+li]:border-line">
      {list.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-3">
          <span className="text-[14px]">{tr('{0} said your entry of {1} ({2}) is not right.', e.who, fmtINR(e.amount), shortDate(e.date))}</span>
          <button type="button" className={us.action('bad')} onClick={() => act(() => app.sharedUdhaar.remove(e.id), tr('Removed: {0}', e.who))}>{tr('Delete')}</button>
        </li>
      ))}
    </ul>
  );
}
