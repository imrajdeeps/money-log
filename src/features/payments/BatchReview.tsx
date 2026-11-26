import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { shortDate } from '../../core/format.ts';
import { readBatch } from './batch.ts';
import type { BatchRow } from './batch.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Several bank messages pasted together: each is read, shown as a line to tick, and the ticked ones are saved in one go. A missed week
// becomes a minute of catching up. Messages that look already saved (the same reference) start unticked, and a line can only be saved
// once it has a category (money received has its own list of categories).
export function BatchReview({ onClose, onSaved }: Readonly<{ onClose: () => void; onSaved: () => void }>) {
  const app = useApp();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [cats, setCats] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const names = useMemo(() => app.categories.map((c) => c.name), [app.categories]);

  function read() {
    const r = readBatch(text, isoDate(), app.entries, app.categories);
    setRows(r);
    setPicked(Object.fromEntries(r.map((x) => [x.key, x.payment !== null && !x.duplicate && x.category !== null])));
    setCats(Object.fromEntries(r.map((x) => [x.key, x.category ?? ''])));
    setError('');
  }

  const chosen = (rows ?? []).filter((r) => picked[r.key] && r.payment && cats[r.key]);

  async function saveAll() {
    if (busy) return;
    setBusy(true);
    setError('');
    let saved = 0;
    try {
      for (const r of chosen) {
        const p = r.payment!;
        await app.addEntry({ amount: p.amount, category: cats[r.key]!, method: p.method, note: r.note, date: p.date ?? isoDate(), kind: p.kind });
        saved++;
        setPicked((cur) => ({ ...cur, [r.key]: false })); // a saved one cannot be saved again by another tap
      }
      app.toast(tr('Saved {0} payments', saved));
      setRows(null);
      setText('');
      onSaved();
    } catch (e) {
      setError(tr('Saved {0} of {1}, then it stopped: {2}', saved, chosen.length, e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  const spent = chosen.filter((r) => r.payment!.kind !== 'in').reduce((n, r) => n + r.payment!.amount, 0);
  const got = chosen.filter((r) => r.payment!.kind === 'in').reduce((n, r) => n + r.payment!.amount, 0);
  const found = (rows ?? []).filter((r) => r.payment);

  if (!rows || found.length === 0) {
    return (
      <div className="flex flex-col gap-2.5 bg-card border border-line rounded-card p-3.5 lg:col-span-2">
        <h3 className="m-0 text-[16px] font-[650] text-ink">{tr('Review several messages')}</h3>
        <p className={ui.hint.replace('mt-1.5', 'mt-0')}>{tr('Paste your bank or UPI messages, one after another with a blank line between them. Tick the ones to save. Nothing is saved until you tap Save.')}</p>
        <textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} aria-label={tr('Payment messages')} spellCheck={false} />
        {rows && <p className={ui.msg('bad')}>{tr('No messages found. Paste them with a blank line between each.')}</p>}
        <div className="flex gap-2.5 [&>*]:flex-1">
          <button type="button" className={ui.btn()} disabled={text.trim() === ''} onClick={read}>{tr('Read them')}</button>
          <button type="button" className={ui.btn('outline')} onClick={onClose}>{tr('Close')}</button>
        </div>
      </div>
    );
  }

  // The design's review: one card per payment (a tick, the name, the day and method, the amount, and its category); one that looks
  // already saved is amber and starts unticked.
  return (
    <div className="flex flex-col gap-3 lg:col-span-2">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[24px] leading-[30px] font-bold text-ink">{tr('Review {0} payments', found.length)}</h3>
        <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('Read from the messages you pasted. Untick any you do not want, and check each category.')}</p>
      </div>
      {rows.map((r) => {
        if (!r.payment) return <p key={r.key} className="m-0 text-[13px] text-muted">{tr('Skipped, not a payment: {0}', r.text.slice(0, 60))}</p>;
        const p = r.payment;
        const options = p.kind === 'in' ? app.incomeCats : names;
        const on = !!picked[r.key];
        return (
          <div key={r.key} className={ui.cx('flex flex-col gap-2.5 rounded-card border px-3.5 py-3', r.duplicate ? 'border-[#d98a1c] bg-[color-mix(in_srgb,var(--card)_60%,var(--bg))]' : 'border-line bg-card')}>
            <label className="grid grid-cols-[26px_minmax(0,1fr)_auto] gap-3 items-center cursor-pointer">
              <input type="checkbox" checked={on} onChange={(e) => setPicked({ ...picked, [r.key]: e.target.checked })} />
              <span className={ui.cx('flex flex-col min-w-0', on ? '' : 'text-muted')}><span className="text-[16px] font-semibold truncate">{p.merchant ?? tr('(no name)')}</span><span className="text-[13px] text-muted">{[shortDate(p.date ?? isoDate()), p.method ?? ''].filter(Boolean).join(' · ')}</span></span>
              <span className={ui.cx('text-[17px] font-bold tabular-nums', p.kind === 'in' ? 'text-good' : on ? '' : 'text-muted')}>{p.kind === 'in' ? '+' : ''}{fmtINR(p.amount)}</span>
            </label>
            <label className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 items-center">
              <span className="text-[13px] font-semibold text-muted">{tr('Category')}</span>
              <select value={cats[r.key] ?? ''} onChange={(e) => setCats({ ...cats, [r.key]: e.target.value })}>
                <option value="">{tr('Choose category…')}</option>
                {options.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {r.duplicate && <p className="m-0 px-2.5 py-1.5 rounded-lg bg-warn-bg text-warn text-[13px] font-semibold">{tr('Looks already saved: {0} {1} on {2}. Left unticked.', p.merchant ?? '', fmtINR(p.amount), shortDate(p.date ?? isoDate()))}</p>}
          </div>
        );
      })}
      <p className="m-0 text-[14px] text-muted tabular-nums">{[tr('{0} ticked', chosen.length), spent > 0 ? tr('{0} spent', fmtINR(spent)) : '', got > 0 ? tr('{0} received', fmtINR(got)) : ''].filter(Boolean).join(' · ')}</p>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <button type="button" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy || chosen.length === 0} onClick={() => { void saveAll(); }}>{tr('Save {0} payments', chosen.length)}</button>
      <button type="button" className={ui.btn('outline')} onClick={() => { setRows(null); onClose(); }}>{tr('Cancel')}</button>
    </div>
  );
}
