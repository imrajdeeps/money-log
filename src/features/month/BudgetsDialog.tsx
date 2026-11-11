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
export function BudgetsDialog({ onClose, focus }: { onClose: () => void; focus?: string }) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Group>('Spending');
  const [error, setError] = useState('');
  const [addError, setAddError] = useState('');

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

  const shown = (n: string, budget: number) => text[n] ?? (budget > 0 ? String(budget) : '');

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
    app.toast(tr('Added {0}', r.name));
  }

  return (
    <dialog
      ref={ref}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      aria-labelledby="budgets-title"
    >
      <form onSubmit={save} noValidate>
        <h2 id="budgets-title">{tr('Categories and budgets')}</h2>
        <p className="text-muted text-[13px]">
          {tr('A budget is the amount you plan to spend in a month; it applies to every month. Leave it empty for none.')}
        </p>
        {GROUPS.map((g) => {
          const items = app.categories.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <h3 className="text-[16px] mt-5 mb-2">{tr(g)}</h3>
              <ul className={ui.list()}>
                {items.map((c) => (
                  <li key={c.name} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={ui.rowMain(true)}>
                      <b>{c.name}</b>
                      {c.source === 'mine' && <small>{tr('yours')}</small>}
                    </span>
                    <label className="flex items-center gap-1 flex-none [&_input]:w-[104px] [&_input]:text-right">
                      <span className="sr-only">{tr('Monthly budget for {0}, in rupees', c.name)}</span>
                      <span aria-hidden="true">₹</span>
                      <input
                        data-cat={c.name}
                        inputMode="decimal"
                        placeholder="none"
                        value={shown(c.name, c.budget)}
                        onChange={(e) => { setText({ ...text, [c.name]: e.target.value }); setError(''); }}
                      />
                    </label>
                    <button type="button" className={ui.icoBtn} aria-label={tr('Remove {0}', c.name)} onClick={() => { void app.removeCategory(c.name); }}><Icon name="close" size={18} /></button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-muted text-[13px]">{tr('Removing a category only takes it off the pick list; payments already logged keep it. To bring a removed one back, add it again by name.')}</p>

        <h3 className="text-[16px] mt-5 mb-2">{tr('Add a category')}</h3>
        <label className={ui.field}>
          <span>{tr('Name')}</span>
          <input
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => { setName(e.target.value); setAddError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
          />
        </label>
        <label className={ui.field}>
          <span>{tr('Group')}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
            {GROUPS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
          </select>
        </label>
        <p className={ui.msg('bad')} role="alert" hidden={!addError}>{addError}</p>
        <div className={ui.btnRow}>
          <button type="button" className={ui.btn('ghost')} onClick={() => void add()}>{tr('Add category')}</button>
        </div>

        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <p className="text-muted text-[13px]">{tr('Total planned each month from the budgets above: {0} (savings not counted).', fmtINR(app.categories.filter((c) => c.group !== 'Saving').reduce((a, c) => a + (parseAmount(shown(c.name, c.budget).replace(/[₹,\s]/g, '')) ?? 0), 0)))}</p>
        <div className={ui.btnRow}>
          <button type="submit" className={ui.btn()}>{tr('Save budgets')}</button>
          <button type="button" className={ui.btn('ghost')} onClick={close}>{tr('Close')}</button>
        </div>
      </form>
    </dialog>
  );
}
