import { useState } from 'react';
import { useApp } from '../context.tsx';
import { MAX_NAME } from '../categories.ts';
import { GROUPS } from '../logic.ts';
import type { Group } from '../logic.ts';

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
        <div className="newcat">
          <label className="field">
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
          <label className="field">
            <span>Group</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <p className="msg bad" role="alert" hidden={!error}>{error}</p>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => void add()}>Add category</button>
            <button type="button" className="btn ghost" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
