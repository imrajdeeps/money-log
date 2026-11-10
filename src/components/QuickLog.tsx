import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context.tsx';
import { CategorySelect } from '../components/CategorySelect.tsx';
import { EditDialog } from '../components/EditDialog.tsx';
import { MethodChips } from '../components/MethodChips.tsx';
import { PendingPhotos } from '../components/PendingPhotos.tsx';
import { SplitEditor, freshSplit } from '../components/SplitEditor.tsx';
import type { SplitState } from '../components/SplitEditor.tsx';
import { shortDate } from '../format.ts';
import { activeMembers, computeShares } from '../groups.ts';
import { METHODS, byRecent, catKey, fmtINR, frequentCategories, isValidDate, isoDate, myShare, parseAmount } from '../logic.ts';
import type { Entry, Method, NewEntryInput } from '../logic.ts';

const METHOD_KEY = 'money-log.method';

function lastMethod(): Method | null {
  try {
    const v = localStorage.getItem(METHOD_KEY);
    return (METHODS as readonly string[]).includes(v ?? '') ? (v as Method) : null;
  } catch {
    return null;
  }
}

export function LogScreen({ active }: { active: boolean }) {
  const app = useApp();
  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState<Method | null>(lastMethod);
  const [note, setNote] = useState('');
  const [date, setDate] = useState<string | null>(null); // null = today
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [groupId, setGroupId] = useState(''); // '' = private
  const [split, setSplit] = useState<SplitState | null>(null);
  const today = isoDate();
  const people = useMemo(() => (groupId ? activeMembers(app.members, groupId) : []), [app.members, groupId]);
  const groupName = (id: string | null) => app.groups.find((g) => g.id === id)?.name ?? 'a group';

  useEffect(() => { if (active) amountRef.current?.focus(); }, [active]);

  const recent = useMemo(() => app.entries.slice().sort(byRecent).slice(0, 20), [app.entries]);
  const frequent = useMemo(() => {
    // shown under the list's spelling, so a plan that spells "rent" differently from older payments ("Rent") still counts
    const canonical = new Map(app.categories.map((c) => [catKey(c.name), c.name]));
    const names = frequentCategories(app.entries, Date.now(), 12).flatMap((c) => canonical.get(catKey(c)) ?? []);
    return [...new Set(names)].slice(0, 6);
  }, [app.entries, app.categories]);

  function pickMethod(m: Method | null) {
    setMethod(m);
    try { localStorage.setItem(METHOD_KEY, m ?? ''); } catch { /* a remembered choice is a convenience only */ }
  }

  const fail = (msg: string) => setError(msg);

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const amt = parseAmount(amount);
    if (amt === null) return fail(amount.trim() === '' ? 'Enter an amount.' : 'Amount must be a positive number with at most 2 decimals.');
    if (!category) return fail('Pick a category.');
    const d = date ?? today;
    if (!isValidDate(d)) return fail('Pick a valid date.');
    if (d > today) return fail('The date cannot be in the future.');
    let group: NewEntryInput['group'] = null;
    if (groupId) {
      if (!app.me || !split) return fail('Sign in to share an expense with a group.');
      const r = computeShares(split.mode, amt, people.map((m) => m.user_id), new Set(split.included), split.values);
      if (!r.shares) return fail(r.problem);
      if (split.paidBy !== app.me && !(app.me in r.shares)) return fail('You can only record an expense that you paid or share in.');
      group = { group_id: groupId, paid_by: split.paidBy, shares: r.shares };
    }
    const id = await app.addEntry({ amount: amt, category, method, note: note.trim(), date: d, group });
    let toast = `Saved ${fmtINR(amt)} · ${category}`;
    if (photos.length) {
      try { await app.addReceipts(id, photos); } catch (e) { toast += `. The photo could not be attached: ${e instanceof Error ? e.message : String(e)}`; }
    }
    app.toast(toast);
    setPhotos([]);
    setAmount('');
    setNote('');
    setCategory('');
    setDate(null);
    setGroupId(''); // the next payment is private unless chosen otherwise
    setSplit(null);
    setError('');
    amountRef.current?.focus();
  }

  return (
    <section aria-label="Log a payment">
      <form onSubmit={save} noValidate autoComplete="off" className="card">
        <label className="amount">
          <span aria-hidden="true">₹</span>
          <input
            ref={amountRef}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0"
            aria-label="Amount in rupees"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }}
          />
        </label>

        {frequent.length > 0 && (
          <div className="chips quick" role="group" aria-label="Frequent categories">
            {frequent.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => { setCategory(c); setError(''); }}>
                {c}
              </button>
            ))}
          </div>
        )}

        <label className="field" htmlFor="log-cat"><span>Category</span></label>
        <CategorySelect id="log-cat" value={category} onChange={(v) => { setCategory(v); setError(''); }} />

        <MethodChips value={method} onChange={pickMethod} options={METHODS} />

        <label className="field">
          <span>Note (optional)</span>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. lunch with team" />
        </label>

        <label className="field">
          <span>Date</span>
          <input type="date" value={date ?? today} max={today} onChange={(e) => setDate(e.target.value || null)} />
        </label>

        {app.syncEnabled && app.me && <PendingPhotos photos={photos} onChange={setPhotos} />}

        {app.groups.length > 0 && (
          <label className="field">
            <span>Share with</span>
            <select
              value={groupId}
              onChange={(e) => {
                const id = e.target.value;
                setGroupId(id);
                setSplit(id && app.me ? freshSplit(app.me, activeMembers(app.members, id)) : null);
                setError('');
              }}
            >
              <option value="">Nobody (private)</option>
              {app.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        {groupId && split && app.me && (
          <>
            <SplitEditor people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} />
            <p className="muted small">Everyone in {groupName(groupId)} will see the amount, category, note and date, and who paid. Only your share counts toward your own budget.</p>
          </>
        )}

        <p className="msg bad" role="alert" hidden={!error}>{error}</p>
        <button type="submit" className="btn big">{groupId ? 'Save shared expense' : 'Save payment'}</button>
      </form>

      <h2 className="h2">Recent</h2>
      {recent.length === 0 ? (
        <p className="muted">No payments yet. Your last 20 appear here.</p>
      ) : (
        <ul className="list">
          {recent.map((e) => (
            <li key={e.id}>
              <button type="button" className="row" onClick={() => setEditing(e)}>
                <span className="row-main">
                  <b>{e.category}</b>
                  <small>{[shortDate(e.entry_date), e.method, e.note, e.group_id ? `shared with ${groupName(e.group_id)}, total ${fmtINR(e.amount)}` : ''].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="amt">{fmtINR(myShare(e, app.me))}</span>
                {app.syncEnabled && e.dirty ? <span className="dot" role="img" aria-label="Waiting to sync" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
