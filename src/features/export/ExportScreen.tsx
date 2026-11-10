import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { copyText, saveFile } from '../../ui/files.ts';
import { missingFromPlan } from '../../core/categories.ts';
import { shortDate, stamp } from '../../core/format.ts';
import { changedAfterExport, exportRows, fmtINR, isoDate, monthOf, myShare, toCSV, toTSV } from '../../core/logic.ts';
import type { LogLayout } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

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
  const plural = (k: number) => tr('{0} payment{1}', k, k === 1 ? '' : 's');
  // Only count batch members that are still unexported (they may have been marked, or deleted, since).
  const pending = batch.filter((id) => markIds.includes(id));

  async function copy() {
    const ok = await copyText(tsv);
    if (ok) setBatch(markIds);
    app.toast(ok ? tr('Copied {0}. Paste into column A of the first empty row of the Log tab.', plural(n)) : tr('Could not copy. Press and hold the text, select all, and copy it.'));
  }

  async function share() {
    const r = await saveFile(`money-log-${stamp()}.csv`, toCSV(rows, layout), 'text/csv');
    if (r === 'cancelled') return;
    setBatch(markIds);
    app.toast(r === 'shared' ? tr('CSV shared.') : tr('CSV downloaded.'));
  }

  async function mark() {
    if (!window.confirm(tr('Mark the {0} you just copied as exported? Do this only after they are in the spreadsheet; they will no longer appear under "Not yet exported".', plural(pending.length)))) return;
    await app.markExported(pending);
    setBatch([]);
    app.toast(tr('Marked {0} as exported.', plural(pending.length)));
  }

  async function acknowledgeChanged() {
    await app.markExported(changed.map((c) => c.entry.id));
    app.toast(tr('Done.'));
  }

  return (
    <section aria-label={tr('Export to the spreadsheet')}>
      {changed.length > 0 && (
        <div className={ui.card('notice')}>
          <h2>{tr('Changed after export')}</h2>
          <p className="text-[13px]">
            {tr('{0} edited or deleted after being exported, so the matching rows in the spreadsheet\'s Log tab are out of date. Fix or remove them there by hand (the rows hold the earlier values), then tap Done.', plural(changed.length))}
          </p>
          <ul className={ui.list()}>
            {changed.map(({ entry: e, kind }) => (
              <li key={e.id} className={ui.catLineBox}>
                <span>{shortDate(e.entry_date)} · {e.category} · {fmtINR(myShare(e, app.me))}</span>
                <b>{kind}</b>
              </li>
            ))}
          </ul>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={acknowledgeChanged}>{tr('Done, the spreadsheet is updated')}</button>
        </div>
      )}

      <div className={ui.card()}>
        <label className={ui.field}>
          <span>{tr('Which payments')}</span>
          <select value={scope} onChange={(e) => { setScope(e.target.value as Scope); setBatch([]); }}>
            <option value="new">{tr('Not yet exported')}</option>
            <option value="month">{tr('This month')}</option>
            <option value="all">{tr('All payments')}</option>
          </select>
        </label>
        <label className={ui.check + ' mt-3'}>
          <input type="checkbox" checked={layout === 'column'} onChange={(e) => pickLayout(e.target.checked ? 'column' : 'note')} />
          <span>{tr('My spreadsheet\'s Log tab has a Method column')}</span>
        </label>
        <p className="text-muted text-[13px]">{layout === 'column' ? tr('Five columns, for the Log tab with a Method column.') : tr('Four columns: the method is written at the start of the note, like [UPI] lunch.')}</p>
        <p className="text-muted text-[13px]">{n === 0 ? tr('Nothing to export here.') : tr('{0}, oldest first. Columns: {1}.', plural(n), layout === 'column' ? 'Date, Category, Amount, Method, Note' : 'Date, Category, Amount, Note')}</p>
        {unknown.length > 0 && (
          <p className={ui.msg('bad')} role="alert">
            {tr('The spreadsheet does not have {0}:', unknown.length === 1 ? 'this category' : 'these categories')}{' '}<b>{unknown.join(', ')}</b>{tr('. Its Log will show NOT IN LIST and the Budget and Tracker tabs will not count {0} until you add{1} to the spreadsheet\'s category list (Inputs tab), or change the category of {2} here.', unknown.length === 1 ? 'it' : 'them', unknown.length === 1 ? ' it' : ' them', unknown.length === 1 ? 'that payment' : 'those payments')}
          </p>
        )}
        {!app.plan && n > 0 && (
          <p className="text-muted text-[13px]">
            {tr('The spreadsheet only counts the categories on its Budget tab. If your list differs, import your plan in Settings and this screen will name the categories it is missing.')}
          </p>
        )}
        <textarea className="whitespace-pre overflow-auto mt-2" readOnly rows={8} value={tsv} aria-label={tr('Rows to paste into the Log tab')} placeholder={tr('Nothing to export.')} />
        <div className={ui.btnRow}>
          <button type="button" className={ui.btn()} disabled={n === 0} onClick={copy}>{tr('Copy for Excel')}</button>
          <button type="button" className={ui.btn('ghost')} disabled={n === 0} onClick={share}>{tr('Share CSV')}</button>
        </div>
        <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} disabled={pending.length === 0} onClick={mark}>
          {tr('Mark {0} copied as exported', pending.length)}
        </button>
      </div>
      <ol className={ui.steps + ' text-muted text-[13px]'}>
        <li>{tr('Tap')}{' '}<b>{tr('Copy for Excel')}</b>{' '}{tr('(or open the CSV on your Mac).')}</li>
        <li>{tr('In the spreadsheet\'s')}{' '}<b>{tr('Log')}</b>{' '}{tr('tab, click column A of the first empty row and paste.')}</li>
        <li>{tr('Come back and tap')}{' '}<b>{tr('Mark as exported')}</b>{tr('. It marks the payments you just copied, so the next copy holds only new ones.')}</li>
      </ol>
    </section>
  );
}
