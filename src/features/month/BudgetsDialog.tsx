import { Icon } from '../../ui/Icon.tsx';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { MAX_NAME } from '../../core/categories.ts';
import { GROUPS, fmtINR, parseAmount } from '../../core/logic.ts';
import type { Group } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Where the person manages categories and monthly budgets without any spreadsheet: add or remove categories, and give
// each a monthly amount that applies to every month. Categories from an imported plan show the plan's own figures.
export function BudgetsDialog({ onClose, focus, lastMonth, lastBy }: Readonly<{ onClose: () => void; focus?: string; lastMonth?: string; lastBy?: Record<string, number> }>) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Group>('Spending');
  const [error, setError] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // opened for one category (from the Month page): put the cursor in its budget
    if (d && focus) {
      const input = [...d.querySelectorAll<HTMLInputElement>('input[data-cat]')].find((i) => i.dataset.cat === focus);
      input?.scrollIntoView({ block: 'center' });
      input?.focus({ preventScroll: true });
    }
  }, [focus]);
  const close = () => ref.current?.close();

  const shown = (n: string, budget: number) => text[n] ?? (budget > 0 ? budget.toLocaleString('en-IN') : '');

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const changes: { name: string; amount: number }[] = [];
    for (const c of app.categories) {
      const t = shown(c.name, c.budget).replace(/[₹,\s]/g, '');
      if (t === '') { if (c.budget !== 0) changes.push({ name: c.name, amount: 0 }); continue; }
      const amt = parseAmount(t);
      if (amt === null) return setError(tr('The budget for {0} must be a positive number with at most 2 decimals (or empty for none).', c.name));
      if (amt !== c.budget) changes.push({ name: c.name, amount: amt });
    }
    await app.saveBudgets(changes);
    app.toast(changes.length ? tr('Budgets saved') : tr('No changes'));
    close();
  }

  async function add() {
    const r = await app.addCategory(name, group);
    if (!r.ok) { setAddError(r.error); return; }
    setName('');
    setAddError('');
    setAdding(false);
    app.toast(tr('Added {0}', r.name));
  }

  const fmtField = (t: string) => { const n = parseAmount(t.replace(/[₹,\s]/g, '')); return n === null ? t : n.toLocaleString('en-IN'); };
  const planned = (items: typeof app.categories) => items.reduce((a, c) => a + (parseAmount(shown(c.name, c.budget).replace(/[₹,\s]/g, '')) ?? 0), 0);

  return (
    <dialog
      ref={ref}
      className="page"
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-labelledby="budgets-title"
    >
      <form onSubmit={save} noValidate className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-0.5">
          <button type="button" className={ui.backLink} onClick={close}><Icon name="back" size={20} stroke={2} />{tr('Month')}</button>
          <h2 id="budgets-title" className="m-0 text-[24px] leading-[30px] font-bold">{tr('Categories and budgets')}</h2>
          <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('A monthly amount for each category. Leave one empty for no budget.')}</p>
        </div>
        {GROUPS.map((g) => {
          const items = app.categories.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <section key={g} className="flex flex-col gap-2">
              <div className="flex justify-between items-baseline"><h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr(g)}</h3><span className="text-[13px] text-muted tabular-nums">{fmtINR(planned(items))}</span></div>
              <ul className="list-none m-0 p-0 px-4 bg-card border border-line rounded-card">
                {items.map((c, i) => (
                  <li key={c.name} className={ui.cx('grid grid-cols-[minmax(0,1fr)_128px] gap-3 items-center min-h-[65px] py-2', i > 0 && 'border-t border-line')}>
                    <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold">{c.name}</span>{lastMonth && <span className="text-[12px] text-muted">{tr('{0}: {1}', lastMonth, fmtINR(lastBy?.[c.name.toLowerCase()] ?? 0))}</span>}</span>
                    <label className={ui.money}>
                      <span className="sr-only">{tr('Monthly budget for {0}, in rupees', c.name)}</span>
                      <span aria-hidden="true">₹</span>
                      <input
                        data-cat={c.name}
                        inputMode="decimal"
                        placeholder={tr('No budget')}
                        value={shown(c.name, c.budget)}
                        onChange={(e) => { setText({ ...text, [c.name]: e.target.value }); setError(''); }}
                        onBlur={(e) => setText({ ...text, [c.name]: fmtField(e.target.value) })}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {adding ? (
          <div className="flex flex-col gap-3 bg-card border border-line rounded-card p-3.5">
            <label className={ui.fieldBare}>
              <span>{tr('Name of the new category')}</span>
              <input value={name} maxLength={MAX_NAME} autoFocus onChange={(e) => { setName(e.target.value); setAddError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />
            </label>
            <label className={ui.fieldBare}>
              <span>{tr('Group')}</span>
              <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>{GROUPS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</select>
            </label>
            <p className={ui.msg('bad')} role="alert" hidden={!addError}>{addError}</p>
            <div className="flex gap-2.5 [&>*]:flex-1">
              <button type="button" className={ui.btn()} onClick={() => void add()}>{tr('Add category')}</button>
              <button type="button" className={ui.btn('outline')} onClick={() => setAdding(false)}>{tr('Cancel')}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="min-h-12 rounded-card border border-dashed border-control-line bg-transparent text-brand text-[15px] font-[650] cursor-pointer [font-family:inherit]" onClick={() => setAdding(true)}>{tr('+ New category')}</button>
        )}

        <details className="text-[14px]">
          <summary className="cursor-pointer text-muted min-h-11 flex items-center">{tr('Remove a category')}</summary>
          <p className="m-0 mb-2 text-[13px] text-muted">{tr('Removing a category only takes it off the pick list; payments already logged keep it. To bring a removed one back, add it again by name.')}</p>
          <ul className="list-none m-0 p-0 flex flex-wrap gap-2">
            {app.categories.map((c) => <li key={c.name}><button type="button" className={ui.chip} aria-label={tr('Remove {0}', c.name)} onClick={() => { void app.removeCategory(c.name); }}>{c.name} ✕</button></li>)}
          </ul>
        </details>

        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <p className="m-0 text-[14px] text-muted">{tr('Total each month, savings apart:')} <strong className="text-ink tabular-nums">{fmtINR(planned(app.categories.filter((c) => c.group !== 'Saving')))}</strong></p>
        <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')}>{tr('Save budgets')}</button>
      </form>
    </dialog>
  );
}
