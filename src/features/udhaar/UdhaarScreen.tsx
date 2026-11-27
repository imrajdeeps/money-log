import { useState } from 'react';
import { ask } from '../../ui/confirm.tsx';
import { useApp } from '../../data/context.tsx';
import { shortDate } from '../../core/format.ts';
import { fmtINR } from '../../core/logic.ts';
import type { UdhaarItem } from '../../core/goals.ts';
import { udhaarRemindText } from '../../core/upi.ts';
import { udhaarTotals } from '../../core/udhaar.ts';
import { splitShared, withShared } from '../../core/sharedUdhaar.ts';
import { useProfile } from '../../data/useProfile.ts';
import { myUpi } from '../../data/phonePrefs.ts';
import { WhatsAppButton } from '../../ui/WhatsAppButton.tsx';
import { UdhaarForm } from './UdhaarForm.tsx';
import { SharedAnswers, SharedDeclined, SharedRow, SharedSettled } from './SharedEntries.tsx';
import { EntryCard, SettledLine } from './EntryCard.tsx';
import * as us from './udhaarStyles.ts';
import { Icon } from '../../ui/Icon.tsx';
import { useSharedUdhaar } from './useSharedUdhaar.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// One private entry, open: Settled, Remind when they owe you, Change, Delete.
function Row({ u, onEdit }: Readonly<{ u: UdhaarItem; onEdit: () => void }>) {
  const app = useApp();
  const profile = useProfile();
  const upi = myUpi.use();
  const lent = u.w === 'gave';
  const signedIn = app.syncEnabled && app.sync.mode !== 'signedout';
  return (
    <EntryCard who={u.n} sub={[lent ? tr('You lent') : tr('You borrowed'), shortDate(u.d), u.m].filter(Boolean).join(' · ')} amount={u.a} lent={lent}
      tag={{ text: signedIn ? tr('Private · only you see it') : tr('Only on this device'), tone: 'plain' }}>
      <button type="button" className={us.action('primary')} onClick={() => { void app.setUdhaarSettled(u.id, true).then(() => app.toast(tr('Marked as settled'))); }}>{tr('Settled')}</button>
      {lent && <WhatsAppButton size="entry" label={tr('Remind on WhatsApp')} text={udhaarRemindText({ name: u.n, amount: u.a, upi, payeeName: profile.name || (app.sync.email ?? '').split('@')[0] || 'Me' })} />}
      <button type="button" className={us.action()} onClick={onEdit}>{tr('Change')}</button>
      <button type="button" className={us.action('bad')} onClick={() => { void ask(tr('Delete this entry with {0}? This cannot be undone.', u.n), tr('Delete')).then((yes) => { if (yes) void app.removeUdhaar(u.id).then(() => app.toast(tr('Removed: {0}', u.n))); }); }}>{tr('Delete')}</button>
    </EntryCard>
  );
}

// A private entry that is settled, in a line, with Open again.
function SettledRow({ u }: Readonly<{ u: UdhaarItem }>) {
  const app = useApp();
  const words = u.w === 'gave' ? tr('{0} · you lent {1} · settled {2}', u.n, fmtINR(u.a), shortDate(u.t.slice(0, 10))) : tr('{0} · you borrowed {1} · settled {2}', u.n, fmtINR(u.a), shortDate(u.t.slice(0, 10)));
  return <SettledLine text={words} onOpen={() => { void app.setUdhaarSettled(u.id, false).then(() => app.toast(tr('Opened again'))); }} />;
}

type Totals = ReturnType<typeof udhaarTotals>;

// What is open: how much you are owed and how much you owe, and the net with each person.
function UdhaarTotals({ t }: Readonly<{ t: Totals }>) {
  return (
    <section className="bg-card border border-line rounded-card p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5"><span className="text-[13px] text-muted">{tr('You are owed')}</span><span className={`text-[26px] leading-8 font-[750] tabular-nums ${t.owedToMe > 0 ? 'text-good' : 'text-muted'}`}>{fmtINR(t.owedToMe)}</span></div>
        <div className="flex flex-col gap-0.5"><span className="text-[13px] text-muted">{tr('You owe')}</span><span className={`text-[26px] leading-8 font-[750] tabular-nums ${t.iOwe > 0 ? 'text-bad' : 'text-muted'}`}>{fmtINR(t.iOwe)}</span></div>
      </div>
      {t.people.length > 0 && (
        <ul className="list-none m-0 p-0 border-t border-line [&>li+li]:border-t [&>li+li]:border-line">
          {t.people.map((p) => (
            <li key={p.key} className="flex justify-between items-center gap-2.5 min-h-11 text-[15px]">
              <span className="min-w-0 [overflow-wrap:anywhere]">{p.net > 0 ? tr('{0} owes you', p.name) : tr('You owe {0}', p.name)}</span>
              <strong className={`tabular-nums ${p.net > 0 ? 'text-good' : 'text-bad'}`}>{fmtINR(Math.abs(p.net))}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Udhaar: money lent to or borrowed from anyone (they need not use the app), who has paid back and who has not. An entry with someone
// outside your Circle is private: it stays in your own data, synced and in your backup like your goals. An entry shared with someone in
// your Circle (version 2.0) is kept by the server and both of you see it.
export function UdhaarScreen() {
  const app = useApp();
  const [editing, setEditing] = useState<UdhaarItem | null>(null);
  const [fresh, setFresh] = useState(0); // a new key empties the form after each new entry
  const { shared, circle, problem, reload } = useSharedUdhaar();
  const parts = splitShared(shared);
  const t = withShared(udhaarTotals(app.goals), shared);
  const open = app.udhaar.filter((u) => !u.s);
  const settled = app.udhaar.filter((u) => u.s);
  const changed = () => { void reload(); };
  const settledCount = settled.length + parts.settled.length;
  return (
    <section aria-label={tr('Udhaar')} className="grid grid-cols-1 gap-4 items-start lg:grid-cols-2 lg:gap-x-7">
      <div className="flex flex-col gap-4">
        {problem && <p className={ui.msg('bad')} role="status">{problem}</p>}
        <UdhaarTotals t={t} />
        <UdhaarForm key={editing ? editing.id : `new${fresh}`} item={editing ?? undefined} circle={circle} onDone={() => { setEditing(null); setFresh(fresh + 1); }} onShared={changed} />
      </div>
      <div className="flex flex-col gap-4">
        <SharedAnswers list={parts.toAnswer} onChanged={changed} />
        <SharedDeclined list={parts.declined} onChanged={changed} />
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Open')}</h3>
          {open.length === 0 && parts.open.length === 0 && <p className="m-0 text-[14px] text-muted">{tr('Nothing open. Add an entry when you lend or borrow.')}</p>}
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {parts.open.map((e) => <SharedRow key={e.id} e={e} onChanged={changed} />)}
            {open.map((u) => <Row key={u.id} u={u} onEdit={() => { setEditing(u); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
          </ul>
        </section>
        {settledCount > 0 && (
          <details className="group bg-card border border-line rounded-card px-4">
            <summary className="min-h-[52px] flex items-center justify-between cursor-pointer text-[15px] font-[650] list-none [&::-webkit-details-marker]:hidden">{tr('Settled ({0})', settledCount)}<span className="text-muted transition-transform group-open:rotate-180"><Icon name="down" size={18} /></span></summary>
            <ul className="list-none m-0 p-0 pb-2">
              {parts.settled.map((e) => <SharedSettled key={e.id} e={e} onChanged={changed} />)}
              {settled.map((u) => <SettledRow key={u.id} u={u} />)}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
