import { useState } from 'react';
import { useApp } from '../data/context.tsx';
import { MAX_NAME } from '../core/categories.ts';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

const NEW = '__new__';

// The picker for income: the built-in income categories, then the person's own. The last choice adds one on the spot.
export function IncomeCategorySelect({ id, value, onChange }: Readonly<{ id: string; value: string; onChange: (v: string) => void }>) {
  const app = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const known = app.incomeCats.includes(value);

  async function add() {
    const r = await app.addIncomeCategory(name);
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
        <option value="" disabled>{tr('Choose category…')}</option>
        {value && !known && <option value={value}>{tr('{0} (not in your list)', value)}</option>}
        {app.incomeCats.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value={NEW}>{tr('＋ New income category…')}</option>
      </select>
      {adding && (
        <div className={ui.newCat}>
          <label className={ui.field}>
            <span>{tr('Name of the new income category')}</span>
            <input
              value={name}
              maxLength={MAX_NAME}
              autoFocus
              onChange={(e) => { setName(e.target.value); setError(''); }}
              // Enter adds the category; it must not save the form this sits in
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            />
          </label>
          <p className={ui.msg('bad')} role="alert" hidden={!error}>{error}</p>
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn()} onClick={() => void add()}>{tr('Add category')}</button>
            <button type="button" className={ui.btn('ghost')} onClick={() => { setAdding(false); setError(''); }}>{tr('Cancel')}</button>
          </div>
        </div>
      )}
    </>
  );
}
