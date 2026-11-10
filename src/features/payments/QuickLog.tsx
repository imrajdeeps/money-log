import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useApp } from '../../data/context.tsx';
import { CategorySelect } from '../../ui/CategorySelect.tsx';
import { MethodChips } from './MethodChips.tsx';
import { PendingPhotos } from './PendingPhotos.tsx';
import { CoupleSplit } from './CoupleSplit.tsx';
import { SplitEditor, freshSplit } from './SplitEditor.tsx';
import type { SplitState } from './SplitEditor.tsx';
import { activeMembers, computeShares } from '../../core/groups.ts';
import { alreadyAdded, noteFor, parseMessage, suggestCategory } from './smsParse.ts';
import { METHODS, catKey, fmtINR, frequentCategories, isValidDate, isoDate, parseAmount } from '../../core/logic.ts';
import type { Method, NewEntryInput } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const METHOD_KEY = 'money-log.method';

function lastMethod(): Method | null {
  try {
    const v = localStorage.getItem(METHOD_KEY);
    return (METHODS as readonly string[]).includes(v ?? '') ? (v as Method) : null;
  } catch {
    return null;
  }
}

// The payment form behind the "+ Add expense" button. It lives in a sheet that stays mounted, so a half-typed payment
// survives closing it; the sheet focuses the amount (amountRef) the moment it opens.
export function QuickLog({ amountRef, onSaved, category: preset }: { amountRef: RefObject<HTMLInputElement | null>; onSaved: () => void; category?: string }) {
  const app = useApp();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState<Method | null>(lastMethod);
  const [note, setNote] = useState('');
  const [date, setDate] = useState<string | null>(null); // null = today
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [groupId, setGroupId] = useState(''); // '' = private
  const [split, setSplit] = useState<SplitState | null>(null);
  const [message, setMessage] = useState(''); // a bank message pasted to fill the form from
  const [readNote, setReadNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  // Add expense was opened for one category (from the Month page): start with it, if it is one of the person's own
  useEffect(() => {
    const known = preset && app.categories.find((c) => catKey(c.name) === catKey(preset));
    if (known) setCategory(known.name);
  }, [preset, app.categories]);
  const today = isoDate();
  const people = useMemo(() => (groupId ? activeMembers(app.members, groupId) : []), [app.members, groupId]);
  const groupName = (id: string | null) => app.groups.find((g) => g.id === id)?.name ?? 'a group';

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

  // Fills the form from a pasted bank message. It only suggests: nothing is saved until Save is tapped.
  function readMessage(text: string) {
    const r = parseMessage(text, today);
    if (!r.ok) { setReadNote({ text: r.problem, bad: true }); return; }
    const p = r.payment;
    const cat = suggestCategory(p.merchant, app.entries, app.categories);
    setAmount(String(p.amount));
    setDate(p.date && p.date !== today ? p.date : null);
    if (p.method) pickMethod(p.method);
    setNote(noteFor(p));
    if (cat) setCategory(cat);
    setError('');
    const bits = [fmtINR(p.amount), p.merchant, cat].filter(Boolean).join(' · ');
    const dup = alreadyAdded(app.entries, p.ref) ? ' A saved payment already has this reference, so save only if it is a different one.' : '';
    setReadNote({ text: tr('Filled in: {0}.{1} Check it, then save.{2}', bits, cat ? '' : ' ' + tr('Pick a category.'), dup), bad: dup !== '' });
  }

  async function pasteAndRead() {
    setPasteOpen(true);
    try {
      const text = await navigator.clipboard.readText();
      setMessage(text);
      readMessage(text);
    } catch {
      setReadNote({ text: tr('The browser did not let Money Log read the clipboard. Paste the message into the box instead.'), bad: true });
    }
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const amt = parseAmount(amount);
    if (amt === null) return fail(amount.trim() === '' ? tr('Enter an amount.') : tr('Amount must be a positive number with at most 2 decimals.'));
    if (!category) return fail(tr('Pick a category.'));
    const d = date ?? today;
    if (!isValidDate(d)) return fail(tr('Pick a valid date.'));
    if (d > today) return fail(tr('The date cannot be in the future.'));
    let group: NewEntryInput['group'] = null;
    if (groupId) {
      if (!app.me || !split) return fail(tr('Sign in to share an expense with a group.'));
      const r = computeShares(split.mode, amt, people.map((m) => m.user_id), new Set(split.included), split.values);
      if (!r.shares) return fail(r.problem);
      if (split.paidBy !== app.me && !(app.me in r.shares)) return fail(tr('You can only record an expense that you paid or share in.'));
      group = { group_id: groupId, paid_by: split.paidBy, shares: r.shares };
    }
    const id = await app.addEntry({ amount: amt, category, method, note: note.trim(), date: d, group });
    let toast = tr('Saved {0} · {1}', fmtINR(amt), category);
    if (photos.length) {
      try { await app.addReceipts(id, photos); } catch (e) { toast += tr('. The photo could not be attached: {0}', e instanceof Error ? e.message : String(e)); }
    }
    app.toast(toast);
    setPhotos([]);
    setMessage('');
    setReadNote(null);
    setAmount('');
    setNote('');
    setCategory('');
    setDate(null);
    setGroupId(''); // the next payment is private unless chosen otherwise
    setSplit(null);
    setError('');
    onSaved();
  }

  return (
    <form onSubmit={save} noValidate autoComplete="off" className="quicklog" aria-label={tr('Log a payment')}>
      <details className={ui.pasteBox} open={pasteOpen} onToggle={(e) => setPasteOpen(e.currentTarget.open)}>
        <summary>{tr('Paste a payment message')}</summary>
        <p className="text-muted text-[13px]">{tr('Copy the bank or UPI message, then read it here. It stays on this phone and only fills the form below.')}</p>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => { setMessage(e.target.value); setReadNote(null); }}
          placeholder="e.g. Rs 450.00 debited from A/c XX1234 to VPA swiggy@icici. UPI Ref 412345678901"
          aria-label={tr('Payment message')}
          spellCheck={false}
        />
        <div className={ui.btnRowOf('mt-2.5 mb-1')}>
          <button type="button" className={ui.btn('ghost')} onClick={() => { void pasteAndRead(); }}>{tr('Paste and read')}</button>
          <button type="button" className={ui.btn()} disabled={message.trim() === ''} onClick={() => readMessage(message)}>{tr('Read message')}</button>
        </div>
        {readNote && <p className={ui.msg(readNote.bad ? 'bad' : undefined)} role="status">{readNote.text}</p>}
      </details>

      <label className={ui.amount}>
        <span aria-hidden="true">₹</span>
        <input
          ref={amountRef}
          inputMode="decimal"
          enterKeyHint="done"
          placeholder="0"
          aria-label={tr('Amount in rupees')}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(''); }}
        />
      </label>

      {frequent.length > 0 && (
        <div className={ui.chips} role="group" aria-label={tr('Frequent categories')}>
          {frequent.map((c) => (
            <button key={c} type="button" className={ui.chip} aria-pressed={category === c} onClick={() => { setCategory(c); setError(''); }}>
              {c}
            </button>
          ))}
        </div>
      )}

      <label className={ui.field} htmlFor="log-cat"><span>{tr('Category')}</span></label>
      <CategorySelect id="log-cat" value={category} onChange={(v) => { setCategory(v); setError(''); }} />

      <MethodChips value={method} onChange={pickMethod} options={METHODS} />

      <label className={ui.field}>
        <span>{tr('Note (optional)')}</span>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. lunch with team" />
      </label>

      <label className={ui.field}>
        <span>{tr('Date')}</span>
        <input type="date" value={date ?? today} max={today} onChange={(e) => setDate(e.target.value || null)} />
      </label>

      {app.syncEnabled && app.me && <PendingPhotos photos={photos} onChange={setPhotos} />}

      {app.groups.some((g) => !g.closed_at) && (
        <label className={ui.field}>
          <span>{tr('Share with')}</span>
          <select
            value={groupId}
            onChange={(e) => {
              const id = e.target.value;
              setGroupId(id);
              setSplit(id && app.me ? freshSplit(app.me, activeMembers(app.members, id), app.groups.find((g) => g.id === id)?.usual_split ?? null) : null);
              setError('');
            }}
          >
            <option value="">{tr('Nobody (private)')}</option>
            {app.groups.filter((g) => !g.closed_at).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      {groupId && split && app.me && (
        <>
          {app.groups.find((g) => g.id === groupId)?.kind === 'couple' && people.length === 2
            ? <CoupleSplit people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} />
            : <SplitEditor people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} />}
          <p className="text-muted text-[13px]">{tr('Everyone in {0} will see the amount, category, note and date, and who paid. Only your share counts toward your own budget.', groupName(groupId))}</p>
        </>
      )}

      <p className={ui.msg('bad')} role="alert" hidden={!error}>{error}</p>
      <button type="submit" className={ui.btn('solid', 'big')}>{groupId ? tr('Save shared expense') : tr('Save payment')}</button>
    </form>
  );
}
