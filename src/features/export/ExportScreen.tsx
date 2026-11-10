import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { copyText, saveFile } from '../../ui/files.ts';
import { missingFromPlan } from '../../core/categories.ts';
import { shortDate, stamp } from '../../core/format.ts';
import { changedAfterExport, exportRows, fmtINR, isoDate, monthOf, myShare, toCSV, toTSV } from '../../core/logic.ts';
import type { LogLayout } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

type Scope = 'new' | 'month' | 'all';
const LAYOUT_KEY = 'money-log.logLayout';
// 'note' keeps the method at the start of the note (the original Log tab); 'column' is for a Log tab with a Method column.
const savedLayout = (): LogLayout => { try { return localStorage.getItem(LAYOUT_KEY) === 'column' ? 'column' : 'note'; } catch { return 'note'; } };

export function ExportScreen() {
  const app = useApp();
  const [scope, setScope] = useState<Scope>('new');
  const [layout, setLayout] = useState<LogLayout>(savedLayout);
  const pickLayout = (next: LogLayout) => {
    setLayout(next);
    setBatch([]);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* a remembered choice is a convenience only */ }
  };
  // The payments that were in the last Copy or Share. "Mark as exported" marks exactly these and nothing else, even if
  // a sync brings in more payments afterwards.
  const [batch, setBatch] = useState<string[]>([]);

  const rows = useMemo(() => {
    const cur = monthOf(isoDate());
    const list = app.entries.filter((e) => (scope === 'all' ? true : scope === 'month' ? monthOf(e.entry_date) === cur : !e.exported_at));
    return exportRows(list, app.me, layout);
  }, [app.entries, app.me, scope, layout]);

  const markIds = useMemo(() => {
    const byId = new Map(app.entries.map((e) => [e.id, e]));
    return rows.filter((r) => !byId.get(r.id)?.exported_at).map((r) => r.id);
  }, [app.entries, rows]);

  const changed = useMemo(() => changedAfterExport(app.allEntries), [app.allEntries]);

  // The spreadsheet adds payments up by the categories on its Budget tab; its Log shows "NOT IN LIST" for any other name.
  const unknown = useMemo(() => missingFromPlan(rows.map((r) => r.category), app.plan), [rows, app.plan]);

  const tsv = toTSV(rows, layout);
  const n = rows.length;
  const plural = (k: number) => `${k} payment${k === 1 ? '' : 's'}`;
  // Only count batch members that are still unexported (they may have been marked, or deleted, since).
  const pending = batch.filter((id) => markIds.includes(id));

  async function copy() {
    const ok = await copyText(tsv);
    if (ok) setBatch(markIds);
    app.toast(ok ? `Copied ${plural(n)}. Paste into column A of the first empty row of the Log tab.` : 'Could not copy. Press and hold the text, select all, and copy it.');
  }

  async function share() {
    const r = await saveFile(`money-log-${stamp()}.csv`, toCSV(rows, layout), 'text/csv');
    if (r === 'cancelled') return;
    setBatch(markIds);
    app.toast(r === 'shared' ? 'CSV shared.' : 'CSV downloaded.');
  }

  async function mark() {
    if (!window.confirm(`Mark the ${plural(pending.length)} you just copied as exported? Do this only after they are in the spreadsheet; they will no longer appear under "Not yet exported".`)) return;
    await app.markExported(pending);
    setBatch([]);
    app.toast(`Marked ${plural(pending.length)} as exported.`);
  }

  async function acknowledgeChanged() {
    await app.markExported(changed.map((c) => c.entry.id));
    app.toast('Done.');
  }

  return (
    <section aria-label="Export to the spreadsheet">
      {changed.length > 0 && (
        <div className={ui.card('notice')}>
          <h2>Changed after export</h2>
          <p className="text-[13px]">
            {plural(changed.length)} edited or deleted after being exported, so the matching rows in the spreadsheet's Log tab are out of date.
            Fix or remove them there by hand (the rows hold the earlier values), then tap Done.
          </p>
          <ul className={ui.list()}>
            {changed.map(({ entry: e, kind }) => (
              <li key={e.id} className={ui.catLineBox}>
                <span>{shortDate(e.entry_date)} · {e.category} · {fmtINR(myShare(e, app.me))}</span>
                <b>{kind}</b>
              </li>
            ))}
          </ul>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={acknowledgeChanged}>Done, the spreadsheet is updated</button>
        </div>
      )}

      <div className={ui.card()}>
        <label className={ui.field}>
          <span>Which payments</span>
          <select value={scope} onChange={(e) => { setScope(e.target.value as Scope); setBatch([]); }}>
            <option value="new">Not yet exported</option>
            <option value="month">This month</option>
            <option value="all">All payments</option>
          </select>
        </label>
        <label className={ui.check + ' mt-3'}>
          <input type="checkbox" checked={layout === 'column'} onChange={(e) => pickLayout(e.target.checked ? 'column' : 'note')} />
          <span>My spreadsheet's Log tab has a Method column</span>
        </label>
        <p className="text-muted text-[13px]">{layout === 'column' ? 'Five columns, for the Log tab with a Method column.' : 'Four columns: the method is written at the start of the note, like [UPI] lunch.'}</p>
        <p className="text-muted text-[13px]">{n === 0 ? 'Nothing to export here.' : `${plural(n)}, oldest first. Columns: ${layout === 'column' ? 'Date, Category, Amount, Method, Note' : 'Date, Category, Amount, Note'}.`}</p>
        {unknown.length > 0 && (
          <p className={ui.msg('bad')} role="alert">
            The spreadsheet does not have {unknown.length === 1 ? 'this category' : 'these categories'}: <b>{unknown.join(', ')}</b>.
            Its Log will show NOT IN LIST and the Budget and Tracker tabs will not count {unknown.length === 1 ? 'it' : 'them'} until you add
            {unknown.length === 1 ? ' it' : ' them'} to the spreadsheet's category list (Inputs tab), or change the category of {unknown.length === 1 ? 'that payment' : 'those payments'} here.
          </p>
        )}
        {!app.plan && n > 0 && (
          <p className="text-muted text-[13px]">
            The spreadsheet only counts the categories on its Budget tab. If your list differs, import your plan in Settings and this screen will name the categories it is missing.
          </p>
        )}
        <textarea className="whitespace-pre overflow-auto mt-2" readOnly rows={8} value={tsv} aria-label="Rows to paste into the Log tab" placeholder="Nothing to export." />
        <div className={ui.btnRow}>
          <button type="button" className={ui.btn()} disabled={n === 0} onClick={copy}>Copy for Excel</button>
          <button type="button" className={ui.btn('ghost')} disabled={n === 0} onClick={share}>Share CSV</button>
        </div>
        <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} disabled={pending.length === 0} onClick={mark}>
          Mark {pending.length} copied as exported
        </button>
      </div>
      <ol className={ui.steps + ' text-muted text-[13px]'}>
        <li>Tap <b>Copy for Excel</b> (or open the CSV on your Mac).</li>
        <li>In the spreadsheet's <b>Log</b> tab, click column A of the first empty row and paste.</li>
        <li>Come back and tap <b>Mark as exported</b>. It marks the payments you just copied, so the next copy holds only new ones.</li>
      </ol>
    </section>
  );
}
