import { Icon } from '../../ui/Icon.tsx';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { MAX_NAME } from '../../core/categories.ts';
import { GROUPS, fmtINR, parseAmount } from '../../core/logic.ts';
import type { Group } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

// Where the person manages categories and monthly budgets without any spreadsheet: add or remove categories, and give
// each a monthly amount that applies to every month. Categories from an imported plan show the plan's own figures.
export function BudgetsDialog({ onClose }: { onClose: () => void }) {
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
  }, []);
  const close = () => ref.current?.close();

  const shown = (n: string, budget: number) => text[n] ?? (budget > 0 ? String(budget) : '');

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const changes: { name: string; amount: number }[] = [];
    for (const c of app.categories) {
      if (c.source === 'plan') continue;
      const t = shown(c.name, c.budget).replace(/[₹,\s]/g, '');
      if (t === '') { if (c.budget !== 0) changes.push({ name: c.name, amount: 0 }); continue; }
      const amt = parseAmount(t);
      if (amt === null) return setError(`The budget for ${c.name} must be a positive number with at most 2 decimals (or empty for none).`);
      if (amt !== c.budget) changes.push({ name: c.name, amount: amt });
    }
    await app.saveBudgets(changes);
    app.toast(changes.length ? 'Budgets saved' : 'No changes');
    close();
  }

  async function add() {
    const r = await app.addCategory(name, group);
    if (!r.ok) { setAddError(r.error); return; }
    setName('');
    setAddError('');
    app.toast(`Added ${r.name}`);
  }

  return (
    <dialog
      ref={ref}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      aria-labelledby="budgets-title"
    >
      <form onSubmit={save} noValidate>
        <h2 id="budgets-title">Categories and budgets</h2>
        <p className="text-muted text-[13px]">
          A budget is the amount you plan to spend in a month; it applies to every month. Leave it empty for none.
          Categories from your spreadsheet plan keep the plan's figures for the months it covers.
        </p>
        {GROUPS.map((g) => {
          const items = app.categories.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <h3 className="text-[16px] mt-5 mb-2">{g}</h3>
              <ul className={ui.list()}>
                {items.map((c) => (
                  <li key={c.name} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={ui.rowMain(true)}>
                      <b>{c.name}</b>
                      {c.source === 'plan' && <small>from your spreadsheet</small>}
                      {c.source === 'mine' && <small>yours</small>}
                    </span>
                    {c.source === 'plan' ? (
                      <span className="text-muted text-[13px]">set in the spreadsheet</span>
                    ) : (
                      <label className="flex items-center gap-1 flex-none [&_input]:w-[104px] [&_input]:text-right">
                        <span className="sr-only">Monthly budget for {c.name}, in rupees</span>
                        <span aria-hidden="true">₹</span>
                        <input
                          inputMode="decimal"
                          placeholder="none"
                          value={shown(c.name, c.budget)}
                          onChange={(e) => { setText({ ...text, [c.name]: e.target.value }); setError(''); }}
                        />
                      </label>
                    )}
                    {c.source !== 'plan' && (
                      <button type="button" className={ui.icoBtn} aria-label={`Remove ${c.name}`} onClick={() => { void app.removeCategory(c.name); }}><Icon name="close" size={18} /></button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-muted text-[13px]">Removing a category only takes it off the pick list; payments already logged keep it. To bring a removed one back, add it again by name.</p>

        <h3 className="text-[16px] mt-5 mb-2">Add a category</h3>
        <label className={ui.field}>
          <span>Name</span>
          <input
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => { setName(e.target.value); setAddError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
          />
        </label>
        <label className={ui.field}>
          <span>Group</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
            {GROUPS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <p className={ui.msg('bad')} role="alert" hidden={!addError}>{addError}</p>
        <div className={ui.btnRow}>
          <button type="button" className={ui.btn('ghost')} onClick={() => void add()}>Add category</button>
        </div>

        {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
        <p className="text-muted text-[13px]">Total planned each month from the budgets above: {fmtINR(app.categories.filter((c) => c.source !== 'plan' && c.group !== 'Saving').reduce((a, c) => a + (parseAmount(shown(c.name, c.budget).replace(/[₹,\s]/g, '')) ?? 0), 0))} (savings not counted).</p>
        <div className={ui.btnRow}>
          <button type="submit" className={ui.btn()}>Save budgets</button>
          <button type="button" className={ui.btn('ghost')} onClick={close}>Close</button>
        </div>
      </form>
    </dialog>
  );
}
