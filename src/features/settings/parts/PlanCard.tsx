import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { parseBlockText } from '../../../core/blocks.ts';
import { readTextFile } from '../../../ui/files.ts';
import { monthLabel, shortDate } from '../../../core/format.ts';
import { GROUPS } from '../../../core/logic.ts';
import { importedOn, errText } from './shared.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

export function PlanCard() {
  const app = useApp();
  const [text, setText] = useState('');
  const [fileErr, setFileErr] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseBlockText(text) : null), [text]);
  const { plan: p, due } = app;

  async function pickFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try { setText(await readTextFile(f)); setFileErr(''); } catch (e) { setFileErr(errText(e)); }
  }

  async function apply() {
    if (!parsed?.ok) return;
    if (parsed.kind === 'budget') await app.applyPlan(parsed.plan);
    else await app.applyDue(parsed.data);
    app.toast(parsed.kind === 'budget' ? tr('Plan imported') : tr('Due list imported'));
    setText('');
  }

  const replacing = parsed?.ok && ((parsed.kind === 'budget' && p) || (parsed.kind === 'due' && due));

  return (
    <div className={ui.card()}>
      <h2>{tr('Spreadsheet plan (optional)')}</h2>
      <p className="text-muted text-[13px]">
        {tr('The app works on its own: it has built-in categories and you can add your own and set budgets under Month. If you also keep the spreadsheet, import its blocks here. The spreadsheet\'s categories, groups and planned amounts then take over for the months it covers, and nothing you logged changes.')}
      </p>
      <ul className={ui.facts + ' text-[13px]'}>
        <li><b>{tr('Budget')}</b>: {p ? tr('{0} categories, {1} to {2}. Imported {3}.', p.rows.length, monthLabel(p.months[0] ?? ''), monthLabel(p.months[p.months.length - 1] ?? ''), importedOn(p.importedAt)) : tr('not imported. Optional: the app has its own categories and budgets.')}</li>
        <li><b>{tr('Due list')}</b>: {due ? tr('{0} items. Imported {1}.', due.items.length, importedOn(due.importedAt)) : tr('not imported.')}</li>
      </ul>
      <ol className={ui.steps + ' text-muted text-[13px]'}>
        <li>{tr('In the spreadsheet\'s')}{' '}<b>{tr('App export')}</b>{' '}{tr('tab, copy one block: the budget')}{' '}<b>{tr('A5 to AL34')}</b>{tr(' or the due list')}{' '}<b>{tr('A38 to E66')}</b>.</li>
        <li>{tr('Paste it below, or choose a .tsv/.csv file. The app recognises which block it is. Importing replaces that block only and never touches your payments.')}</li>
      </ol>
      <textarea className="whitespace-pre overflow-auto mt-2" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label={tr('Block pasted from the spreadsheet')} placeholder={tr('Paste the block here')} spellCheck={false} />
      <label className={ui.btn('ghost', 'md', ui.inCard)}>
        {tr('Choose a file')}
        <input type="file" accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values" onChange={pickFile} />
      </label>
      {fileErr && <p className={ui.msg('bad')} role="alert">{fileErr}</p>}
      {parsed && !parsed.ok && <p className={ui.msg('bad')} role="alert">{parsed.error}</p>}
      {parsed?.ok && parsed.kind === 'budget' && (
        <div className={ui.msg('good')} role="status">
          <p>{tr('Budget block:')}{' '}<b>{parsed.summary.categories}</b>{' '}{tr('categories for')}{' '}<b>{parsed.summary.months}</b>{' '}{tr('months ({0} to {1}).', monthLabel(parsed.summary.first), monthLabel(parsed.summary.last))}</p>
          <p className="text-[13px]">{GROUPS.map((g) => `${g}: ${parsed.summary.byGroup[g]}`).join(' · ')}</p>
        </div>
      )}
      {parsed?.ok && parsed.kind === 'due' && (
        <div className={ui.msg('good')} role="status">
          <p>{tr('Due list:')}{' '}<b>{parsed.summary.oneoffs}</b>{' '}{tr('one-off payment{0} and', parsed.summary.oneoffs === 1 ? '' : 's')}{' '}<b>{parsed.summary.todos}</b>{' '}{tr('to-do{0}{1}.', parsed.summary.todos === 1 ? '' : 's', parsed.summary.undated ? tr(', {0} without a date', parsed.summary.undated) : '')}</p>
          <p className="text-[13px]">{tr('Next: {0}. Done marks you made in the app are kept for items that are still on the list.', parsed.data.items.filter((i) => i.due && !i.done).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')).slice(0, 1).map((i) => `${i.title} (${shortDate(i.due!)})`).join('') || tr('nothing dated'))}</p>
        </div>
      )}
      <button type="button" className={ui.btn('solid', 'md', ui.inCard)} disabled={!parsed?.ok} onClick={apply}>{replacing ? tr('Replace this block') : tr('Import this block')}</button>
    </div>
  );
}
