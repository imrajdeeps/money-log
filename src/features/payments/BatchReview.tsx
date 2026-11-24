import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { fmtINR, isoDate } from '../../core/logic.ts';
import { shortDate } from '../../core/format.ts';
import { readBatch } from './batch.ts';
import type { BatchRow } from './batch.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Several bank messages pasted together: each is read, shown as a line to tick, and the ticked ones are saved in one go. A missed week
// becomes a minute of catching up. Messages that look already saved (the same reference) start unticked.
export function BatchReview({ onDone }: Readonly<{ onDone: () => void }>) {
  const app = useApp();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [cats, setCats] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const names = useMemo(() => app.categories.map((c) => c.name), [app.categories]);

  function read() {
    const r = readBatch(text, isoDate(), app.entries, app.categories);
    setRows(r);
    setPicked(Object.fromEntries(r.map((x) => [x.key, x.payment !== null && !x.duplicate && x.payment.kind === 'out' && x.category !== null])));
    setCats(Object.fromEntries(r.map((x) => [x.key, x.category ?? ''])));
  }

  const chosen = (rows ?? []).filter((r) => picked[r.key] && r.payment && (r.payment.kind === 'in' || cats[r.key]));

  async function saveAll() {
    setBusy(true);
    for (const r of chosen) {
      const p = r.payment!;
      await app.addEntry({ amount: p.amount, category: p.kind === 'in' ? (r.category ?? '') : cats[r.key]!, method: p.method, note: r.note, date: p.date ?? isoDate(), kind: p.kind });
    }
    setBusy(false);
    app.toast(tr('Saved {0} payments', chosen.length));
    setRows(null);
    setText('');
    onDone();
  }

  return (
    <div className={ui.card()}>
      <h3>{tr('Review several messages')}</h3>
      <p className="text-muted text-[13px]">{tr('Paste your bank or UPI messages, one after another with a blank line between them. Tick the ones to save. Nothing is saved until you tap Save.')}</p>
      <textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} aria-label={tr('Payment messages')} spellCheck={false} />
      <div className={ui.btnRowOf('mt-2.5 mb-1')}>
        <button type="button" className={ui.btn()} disabled={text.trim() === ''} onClick={read}>{tr('Read them')}</button>
        <button type="button" className={ui.btn('ghost')} onClick={onDone}>{tr('Close')}</button>
      </div>
      {rows && rows.length === 0 && <p className={ui.msg('bad')}>{tr('No messages found. Paste them with a blank line between each.')}</p>}
      {rows && rows.length > 0 && (
        <>
          <ul className={ui.list(true, 'mt-2')}>
            {rows.map((r) => (
              <li key={r.key} className="py-2">
                {r.payment ? (
                  <>
                    <label className={ui.check}>
                      <input type="checkbox" checked={!!picked[r.key]} onChange={(e) => setPicked({ ...picked, [r.key]: e.target.checked })} />
                      <span className="text-left"><b>{r.payment.kind === 'in' ? '+' : ''}{fmtINR(r.payment.amount)}</b> · {r.payment.merchant ?? tr('(no name)')} · {shortDate(r.payment.date ?? isoDate())}</span>
                    </label>
                    {r.duplicate && <p className={ui.msg('bad')}>{tr('Looks already saved (same reference).')}</p>}
                    {r.payment.kind === 'out' && (
                      <select value={cats[r.key] ?? ''} aria-label={tr('Category')} onChange={(e) => setCats({ ...cats, [r.key]: e.target.value })}>
                        <option value="">{tr('Choose category…')}</option>
                        {names.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    )}
                  </>
                ) : (
                  <p className="m-0 text-[13px] text-muted">{tr('Skipped, not a payment: {0}', r.text.slice(0, 60))}</p>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} disabled={busy || chosen.length === 0} onClick={() => { void saveAll(); }}>{tr('Save {0} payments', chosen.length)}</button>
        </>
      )}
    </div>
  );
}
