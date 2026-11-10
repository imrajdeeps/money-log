import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { parseBlockText } from '../../../core/blocks.ts';
import { readTextFile } from '../../../ui/files.ts';
import { monthLabel, shortDate } from '../../../core/format.ts';
import { GROUPS } from '../../../core/logic.ts';
import { importedOn, errText } from './shared.ts';
import * as ui from '../../../ui/styles.ts';

export function PlanCard() {
  const app = useApp();
  const [text, setText] = useState('');
  const [fileErr, setFileErr] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseBlockText(text) : null), [text]);
  const { plan: p, due, net } = app;

  async function pickFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try { setText(await readTextFile(f)); setFileErr(''); } catch (e) { setFileErr(errText(e)); }
  }

  async function apply() {
    if (!parsed?.ok) return;
    if (parsed.kind === 'budget') await app.applyPlan(parsed.plan);
    else if (parsed.kind === 'due') await app.applyDue(parsed.data);
    else await app.applyNet(parsed.data);
    app.toast(parsed.kind === 'budget' ? 'Plan imported' : parsed.kind === 'due' ? 'Due list imported' : 'Net worth and goals imported');
    setText('');
  }

  const replacing = parsed?.ok && ((parsed.kind === 'budget' && p) || (parsed.kind === 'due' && due) || (parsed.kind === 'networth' && net));

  return (
    <div className={ui.card()}>
      <h2>Spreadsheet plan (optional)</h2>
      <p className="text-muted text-[13px]">
        The app works on its own: it has built-in categories and you can add your own and set budgets under Month.
        If you also keep the spreadsheet, import its blocks here. The spreadsheet's categories, groups and planned amounts then
        take over for the months it covers, and nothing you logged changes.
      </p>
      <ul className={ui.facts + ' text-[13px]'}>
        <li><b>Budget</b>: {p ? `${p.rows.length} categories, ${monthLabel(p.months[0] ?? '')} to ${monthLabel(p.months[p.months.length - 1] ?? '')}. Imported ${importedOn(p.importedAt)}.` : 'not imported. Optional: the app has its own categories and budgets.'}</li>
        <li><b>Due list</b>: {due ? `${due.items.length} items. Imported ${importedOn(due.importedAt)}.` : 'not imported.'}</li>
        <li><b>Net worth and goals</b>: {net ? `${net.items.length} figures${net.asOf ? ` for ${monthLabel(net.asOf.slice(0, 7))}` : ''}. Imported ${importedOn(net.importedAt)}.` : 'not imported.'}</li>
      </ul>
      <ol className={ui.steps + ' text-muted text-[13px]'}>
        <li>In the spreadsheet's <b>App export</b> tab, copy one block: the budget <b>A5 to AL34</b>, the due list <b>A38 to E66</b>, or net worth and goals <b>A70 to C79</b>.</li>
        <li>Paste it below, or choose a .tsv/.csv file. The app recognises which block it is. Importing replaces that block only and never touches your payments.</li>
      </ol>
      <textarea className="whitespace-pre overflow-auto mt-2" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Block pasted from the spreadsheet" placeholder="Paste the block here" spellCheck={false} />
      <label className={ui.btn('ghost', 'md', ui.inCard)}>
        Choose a file
        <input type="file" accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values" onChange={pickFile} />
      </label>
      {fileErr && <p className={ui.msg('bad')} role="alert">{fileErr}</p>}
      {parsed && !parsed.ok && <p className={ui.msg('bad')} role="alert">{parsed.error}</p>}
      {parsed?.ok && parsed.kind === 'budget' && (
        <div className={ui.msg('good')} role="status">
          <p>Budget block: <b>{parsed.summary.categories}</b> categories for <b>{parsed.summary.months}</b> months ({monthLabel(parsed.summary.first)} to {monthLabel(parsed.summary.last)}).</p>
          <p className="text-[13px]">{GROUPS.map((g) => `${g}: ${parsed.summary.byGroup[g]}`).join(' · ')}</p>
        </div>
      )}
      {parsed?.ok && parsed.kind === 'due' && (
        <div className={ui.msg('good')} role="status">
          <p>Due list: <b>{parsed.summary.oneoffs}</b> one-off payment{parsed.summary.oneoffs === 1 ? '' : 's'} and <b>{parsed.summary.todos}</b> to-do{parsed.summary.todos === 1 ? '' : 's'}{parsed.summary.undated ? `, ${parsed.summary.undated} without a date` : ''}.</p>
          <p className="text-[13px]">Next: {parsed.data.items.filter((i) => i.due && !i.done).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')).slice(0, 1).map((i) => `${i.title} (${shortDate(i.due!)})`).join('') || 'nothing dated'}. Done marks you made in the app are kept for items that are still on the list.</p>
        </div>
      )}
      {parsed?.ok && parsed.kind === 'networth' && (
        <div className={ui.msg('good')} role="status">
          <p>Net worth and goals: <b>{parsed.summary.items}</b> figures{parsed.summary.asOf ? ` for ${monthLabel(parsed.summary.asOf.slice(0, 7))}` : ''}.</p>
        </div>
      )}
      <button type="button" className={ui.btn('solid', 'md', ui.inCard)} disabled={!parsed?.ok} onClick={apply}>{replacing ? 'Replace this block' : 'Import this block'}</button>
    </div>
  );
}
