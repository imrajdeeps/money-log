import { useState } from 'react';
import { useApp } from '../data/context.tsx';
import { MAX_NAME } from '../core/categories.ts';
import { GROUPS } from '../core/logic.ts';
import type { Group } from '../core/logic.ts';
import * as ui from './styles.ts';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
}

const NEW = '__new__';

// Built-in categories, the person's own, and the ones from an imported spreadsheet plan, grouped (Spending, EMI, Family,
// Saving). The last choice adds a category on the spot, so nothing has to be imported first.
export function CategorySelect({ id, value, onChange }: Props) {
  const app = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Group>('Spending');
  const [error, setError] = useState('');
  const known = app.categories.some((c) => c.name === value);

  async function add() {
    const r = await app.addCategory(name, group);
    if (!r.ok) { setError(r.error); return; }
    onChange(r.name);
    setAdding(false);
    setName('');
    setError('');
  }

  return (
    <>
      <select
        id={id}
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) { setAdding(true); return; }
          setAdding(false);
          setError('');
          onChange(e.target.value);
        }}
      >
        <option value="" disabled>Choose category…</option>
        {value && !known && <option value={value}>{value} (not in your list)</option>}
        {GROUPS.map((g) => {
          const items = app.categories.filter((c) => c.group === g);
          return items.length ? (
            <optgroup key={g} label={g}>
              {items.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </optgroup>
          ) : null;
        })}
        <option value={NEW}>＋ New category…</option>
      </select>
      {adding && (
        <div className={ui.newCat}>
          <label className={ui.field}>
            <span>Name of the new category</span>
            <input
              value={name}
              maxLength={MAX_NAME}
              autoFocus
              onChange={(e) => { setName(e.target.value); setError(''); }}
              // Enter adds the category; it must not save the payment form this sits in
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            />
          </label>
          <label className={ui.field}>
            <span>Group</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <p className={ui.msg('bad')} role="alert" hidden={!error}>{error}</p>
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn()} onClick={() => void add()}>Add category</button>
            <button type="button" className={ui.btn('ghost')} onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
