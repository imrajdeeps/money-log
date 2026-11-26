import { useApp } from '../../data/context.tsx';
import { useProfile } from '../../data/useProfile.ts';
import { myUpi } from '../../data/phonePrefs.ts';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import { udhaarRemindText } from '../../core/upi.ts';
import type { SharedUdhaar } from '../../core/sharedUdhaar.ts';
import { WhatsAppButton } from '../../ui/WhatsAppButton.tsx';
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

// The tag under a shared entry: whether the other person accepted, is still to answer, or it is settled.
function tag(e: SharedUdhaar): { text: string; tone: string } {
  if (e.settled) return { text: tr('Shared · settled'), tone: 'bg-press text-ink' };
  if (e.state === 'invited') return { text: tr('Shared · waiting for {0} to accept', e.who), tone: 'bg-warn-bg text-warn' };
  return { text: e.mine ? tr('Shared with {0} · accepted', e.who) : tr('Shared by {0}', e.who), tone: 'bg-good-bg text-good' };
}

// One shared entry in the list: Settled or Open again once accepted, Remind when they owe you, Delete for the writer when allowed.
export function SharedRow({ e, onChanged }: Readonly<{ e: SharedUdhaar; onChanged: () => void }>) {
  const app = useApp();
  const profile = useProfile();
  const upi = myUpi.use();
  const act = useAct(onChanged);
  const t = tag(e);
  const canDelete = e.mine && (e.state !== 'active' || e.settled);
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className={ui.rowMain()}>
          <b className={e.settled ? 'line-through text-muted' : undefined}>{e.who}</b>
          <small>{[wayWords(e), shortDate(e.date), e.note].filter(Boolean).join(' · ')}</small>
        </span>
        <span className={`font-bold tabular-nums ${e.settled ? 'text-muted' : e.way === 'gave' ? 'text-good' : 'text-bad'}`}>{fmtINR(e.amount)}</span>
      </div>
      <span className={`inline-block mt-2 px-2 py-0.5 rounded-md text-[12px] font-semibold ${t.tone}`}>{t.text}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {e.state === 'active' && <button type="button" className={ui.btn('ghost', 'small')} onClick={() => act(() => app.sharedUdhaar.settle(e.id, !e.settled), e.settled ? tr('Opened again') : tr('Marked as settled'))}>{e.settled ? tr('Open again') : tr('Settled')}</button>}
        {e.way === 'gave' && !e.settled && <WhatsAppButton size="small" label={tr('Remind')} text={udhaarRemindText({ name: e.who, amount: e.amount, upi, payeeName: profile.name || 'Me' })} />}
        {canDelete && <button type="button" className={ui.btn('danger', 'small')} onClick={() => { if (window.confirm(tr('Delete this entry with {0}? It goes for both of you. This cannot be undone.', e.who))) act(() => app.sharedUdhaar.remove(e.id), tr('Removed: {0}', e.who)); }}>{tr('Delete')}</button>}
      </div>
    </li>
  );
}

// Entries someone in your Circle shared with you: they count only once you accept.
export function SharedAnswers({ list, onChanged }: Readonly<{ list: readonly SharedUdhaar[]; onChanged: () => void }>) {
  const app = useApp();
  const act = useAct(onChanged);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((e) => (
        <div key={e.id} className="bg-press rounded-card px-4 py-3.5 [&>p]:m-0 [&>p+p]:mt-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{tr('Shared with you')}</p>
          <p className="text-[15px]">{e.way === 'took' ? tr('{0} wrote that they lent you {1} on {2}.', e.who, fmtINR(e.amount), shortDate(e.date)) : tr('{0} wrote that they borrowed {1} from you on {2}.', e.who, fmtINR(e.amount), shortDate(e.date))}{e.note ? ` ${e.note}` : ''}</p>
          <p className="text-muted text-[13px]">{tr('It counts only once you accept, and {0} sees your answer.', e.who)}</p>
          <div className={ui.btnRowOf('mt-2.5 mb-0')}>
            <button type="button" className={ui.btn('solid', 'small')} onClick={() => act(() => app.sharedUdhaar.answer(e.id, true), tr('Accepted'))}>{tr('Accept')}</button>
            <button type="button" className={ui.btn('ghost', 'small')} onClick={() => act(() => app.sharedUdhaar.answer(e.id, false), tr('Told {0} it is not right', e.who))}>{tr('That is not right')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Entries you shared that the other person said are not right: say so, and let the writer delete them.
export function SharedDeclined({ list, onChanged }: Readonly<{ list: readonly SharedUdhaar[]; onChanged: () => void }>) {
  const app = useApp();
  const act = useAct(onChanged);
  if (list.length === 0) return null;
  return (
    <ul className={ui.list()}>
      {list.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
          <span className="text-[14px]">{tr('{0} said your entry of {1} ({2}) is not right.', e.who, fmtINR(e.amount), shortDate(e.date))}</span>
          <button type="button" className={ui.btn('ghost', 'small')} onClick={() => act(() => app.sharedUdhaar.remove(e.id), tr('Removed: {0}', e.who))}>{tr('Delete')}</button>
        </li>
      ))}
    </ul>
  );
}
