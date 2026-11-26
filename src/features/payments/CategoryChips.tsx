import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { chipCategories } from './quickLog.ts';
import { frequentCategories } from '../../core/logic.ts';
import { GROUPS, catKey } from '../../core/logic.ts';
import type { EntryKind, Group } from '../../core/logic.ts';
import { MAX_NAME } from '../../core/categories.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// A new category, made from the dashed chip: a name (and for spending, its group).
function NewCategory({ kind, onMade, onCancel }: Readonly<{ kind: EntryKind; onMade: (name: string) => void; onCancel: () => void }>) {
  const app = useApp();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Group>('Spending');
  const [error, setError] = useState('');
  async function add() {
    const r = kind === 'in' ? await app.addIncomeCategory(name) : await app.addCategory(name, group);
    if (!r.ok) { setError(r.error); return; }
    onMade(r.name);
  }
  return (
    <div className={ui.newCat}>
      <label className={ui.field}>
        <span>{tr('Name of the new category')}</span>
        <input value={name} maxLength={MAX_NAME} autoFocus onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />
      </label>
      {kind !== 'in' && (
        <label className={ui.field}>
          <span>{tr('Group')}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>{GROUPS.map((g) => <option key={g} value={g}>{tr(g)}</option>)}</select>
        </label>
      )}
      <p className={ui.msg('bad')} role="alert" hidden={!error}>{error}</p>
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn()} onClick={() => void add()}>{tr('Add category')}</button>
        <button type="button" className={ui.btn('ghost')} onClick={onCancel}>{tr('Cancel')}</button>
      </div>
    </div>
  );
}

// Every category as a tappable chip, the ones this person uses most first, then the dashed "+ New category" chip (the design's
// Category field).
export function CategoryChips({ kind, value, onChange }: Readonly<{ kind: EntryKind; value: string; onChange: (v: string) => void }>) {
  const app = useApp();
  const [adding, setAdding] = useState(false);
  const isIn = kind === 'in';
  const chips = useMemo(() => {
    const names = isIn ? app.incomeCats : app.categories.map((c) => c.name);
    const canonical = new Map(names.map((n) => [catKey(n), n]));
    const used = frequentCategories(app.entries, Date.now(), 100, 90, kind).flatMap((c) => canonical.get(catKey(c)) ?? []);
    return chipCategories(names, used, value, Math.max(names.length, 1));
  }, [app.entries, app.categories, app.incomeCats, isIn, kind, value]);
  return (
    <div>
      <fieldset className={ui.chipsBare}>
        <legend>{tr('Category')}</legend>
        {chips.map((c) => (
          <button key={c} type="button" className={ui.chipTick} aria-pressed={value === c} onClick={() => onChange(c)}>{c}</button>
        ))}
        <button type="button" className={ui.chipNew} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{tr('+ New category')}</button>
      </fieldset>
      {adding && <NewCategory kind={kind} onMade={(n) => { onChange(n); setAdding(false); }} onCancel={() => setAdding(false)} />}
    </div>
  );
}
