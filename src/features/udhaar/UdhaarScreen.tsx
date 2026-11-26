import { useState } from 'react';
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
import { SharedAnswers, SharedDeclined, SharedRow } from './SharedEntries.tsx';
import { useSharedUdhaar } from './useSharedUdhaar.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

function Row({ u, onEdit }: Readonly<{ u: UdhaarItem; onEdit: () => void }>) {
  const app = useApp();
  const profile = useProfile();
  const upi = myUpi.use();
  const lent = u.w === 'gave';
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className={ui.rowMain()}>
          <b className={u.s ? 'line-through text-muted' : undefined}>{u.n}</b>
          <small>{[lent ? tr('You lent') : tr('You borrowed'), shortDate(u.d), u.m].filter(Boolean).join(' · ')}</small>
        </span>
        <span className={`font-bold tabular-nums ${u.s ? 'text-muted' : lent ? 'text-good' : 'text-bad'}`}>{fmtINR(u.a)}</span>
      </div>
      <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[12px] font-semibold bg-press text-ink">{tr('Private')}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={ui.btn('ghost', 'small')} onClick={() => { void app.setUdhaarSettled(u.id, !u.s).then(() => app.toast(u.s ? tr('Opened again') : tr('Marked as settled'))); }}>{u.s ? tr('Open again') : tr('Settled')}</button>
        {lent && !u.s && <WhatsAppButton size="small" label={tr('Remind')} text={udhaarRemindText({ name: u.n, amount: u.a, upi, payeeName: profile.name || (app.sync.email ?? '').split('@')[0] || 'Me' })} />}
        <button type="button" className={ui.btn('ghost', 'small')} onClick={onEdit}>{tr('Change')}</button>
        <button type="button" className={ui.btn('danger', 'small')} onClick={() => { if (window.confirm(tr('Delete this entry with {0}? This cannot be undone.', u.n))) void app.removeUdhaar(u.id).then(() => app.toast(tr('Removed: {0}', u.n))); }}>{tr('Delete')}</button>
      </div>
    </li>
  );
}

type Totals = ReturnType<typeof udhaarTotals>;

// What is open: how much you are owed and how much you owe, and the net with each person. Nothing when nothing is open.
function UdhaarTotals({ t }: Readonly<{ t: Totals }>) {
  if (t.owedToMe <= 0 && t.iOwe <= 0) return null;
  return (
    <div className={ui.card()}>
      <p className="m-0 text-[22px] font-bold tabular-nums">
        {t.owedToMe > 0 && <span className="text-good">{tr('You are owed {0}', fmtINR(t.owedToMe))}</span>}
        {t.owedToMe > 0 && t.iOwe > 0 && ' · '}
        {t.iOwe > 0 && <span className="text-bad">{tr('You owe {0}', fmtINR(t.iOwe))}</span>}
      </p>
      <ul className={ui.list(true, 'mt-2')}>
        {t.people.map((p) => (
          <li key={p.key} className="flex items-center justify-between px-3 py-2">
            <span><b>{p.name}</b> <small className="text-muted">{p.open === 1 ? tr('1 open entry') : tr('{0} open entries', p.open)}</small></span>
            <b className={p.net > 0 ? 'text-good' : 'text-bad'}>{p.net > 0 ? tr('owes you {0}', fmtINR(p.net)) : tr('you owe {0}', fmtINR(-p.net))}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Udhaar: money lent to or borrowed from anyone (they need not use the app), who has paid back and who has not. An entry with someone
// outside your Circle is private: it stays in your own data, synced and in your backup like your goals. An entry shared with someone in
// your Circle (version 2.0) is kept by the server and both of you see it.
export function UdhaarScreen() {
  const app = useApp();
  const [form, setForm] = useState<'new' | UdhaarItem | null>(null);
  const { shared, circle, problem, reload } = useSharedUdhaar();
  const parts = splitShared(shared);
  const t = withShared(udhaarTotals(app.goals), shared);
  const open = app.udhaar.filter((u) => !u.s);
  const settled = app.udhaar.filter((u) => u.s);
  const nothing = app.udhaar.length === 0 && shared.length === 0;
  const changed = () => { void reload(); };
  return (
    <section aria-label={tr('Udhaar')} className="[&>*+*]:mt-4">
      <p className="text-muted text-[13px]">{tr('Money you lent to someone, or borrowed from them: write it down once, tick it off when it comes back. Private unless you share an entry with someone in your Circle.')}</p>
      {problem && <p className={ui.msg('bad')} role="status">{problem}</p>}
      <UdhaarTotals t={t} />
      <SharedAnswers list={parts.toAnswer} onChanged={changed} />
      {!form && <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => setForm('new')}>{tr('Add an entry')}</button>}
      {form && <UdhaarForm key={form === 'new' ? 'new' : form.id} item={form === 'new' ? undefined : form} circle={circle} onDone={() => setForm(null)} onShared={changed} />}
      {nothing && !form && <p className="text-muted">{tr('Nothing yet. Add the first one when you lend or borrow.')}</p>}
      <SharedDeclined list={parts.declined} onChanged={changed} />
      {(open.length > 0 || parts.open.length > 0) && (
        <ul className={ui.list()}>
          {parts.open.map((e) => <SharedRow key={e.id} e={e} onChanged={changed} />)}
          {open.map((u) => <Row key={u.id} u={u} onEdit={() => setForm(u)} />)}
        </ul>
      )}
      {(settled.length > 0 || parts.settled.length > 0) && (
        <details>
          <summary className="cursor-pointer text-[14px] font-semibold">{tr('Settled ({0})', settled.length + parts.settled.length)}</summary>
          <ul className={ui.list(false, 'mt-2')}>
            {parts.settled.map((e) => <SharedRow key={e.id} e={e} onChanged={changed} />)}
            {settled.map((u) => <Row key={u.id} u={u} onEdit={() => setForm(u)} />)}
          </ul>
        </details>
      )}
    </section>
  );
}
