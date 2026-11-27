import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useApp } from '../../data/context.tsx';
import { CategoryChips } from './CategoryChips.tsx';
import { DateChips } from './DateChips.tsx';
import { BatchReview } from './BatchReview.tsx';
import { QuickLineBox } from './QuickLineBox.tsx';
import type { QuickLine } from './quickLine.ts';
import { KindSwitch } from './KindSwitch.tsx';
import { MethodChips } from './MethodChips.tsx';
import { PendingPhotos } from './PendingPhotos.tsx';
import { CoupleSplit } from './CoupleSplit.tsx';
import { SplitEditor, freshSplit } from './SplitEditor.tsx';
import type { SplitState } from './SplitEditor.tsx';
import { activeMembers } from '../../core/groups.ts';
import type { Member } from '../../core/groups.ts';
import { alreadyAdded, noteFor, parseMessage, suggestCategory } from './smsParse.ts';
import { METHODS, catKey, fmtINR, isoDate, monthOf, newId, parseAmount } from '../../core/logic.ts';
import { RepeatTick, repeatSaveNote } from './RepeatTick.tsx';
import type { RepeatGroup } from './RepeatTick.tsx';
import { readBasics, repeatPart, sharedPart } from './formChecks.ts';
import type { RecurInput } from './formChecks.ts';
import { shortDate } from '../../core/format.ts';
import { Icon } from '../../ui/Icon.tsx';
import type { EntryKind, Method, NewEntryInput } from '../../core/logic.ts';
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

// 2.2: the group a repeating shared expense goes to, as the Repeat tick describes it (null while no group and split are chosen).
function repeatGroupOf(groupId: string, split: SplitState | null, people: readonly Member[], me: string | null, groupName: (id: string) => string): RepeatGroup | null {
  if (!groupId || !split || !me) return null;
  const payer = split.paidBy === me ? tr('you') : people.find((m) => m.user_id === split.paidBy)?.display_name ?? '';
  return { name: groupName(groupId), payer, people: new Set([...split.included, split.paidBy]).size };
}

const saveLabel = (isIn: boolean, shared: boolean, busy = false): string => {
  if (busy) return tr('Saving…');
  if (isIn) return tr('Save income');
  return shared ? tr('Save shared expense') : tr('Save payment');
};

// The payment form behind the "+ Add expense" button. It lives in a sheet that stays mounted, so a half-typed payment
// survives closing it; the sheet focuses the amount (amountRef) the moment it opens.
export function QuickLog({ amountRef, onSaved, category: preset, kind: startKind, group: presetGroup, sms, onSms, onSeeAll }: Readonly<{ amountRef: RefObject<HTMLInputElement | null>; onSaved: () => void; category?: string; kind?: EntryKind; group?: string; sms?: string | null; onSms?: () => void; onSeeAll?: () => void }>) {
  const app = useApp();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState<Method | null>(lastMethod);
  const [note, setNote] = useState('');
  const [date, setDate] = useState<string | null>(null); // null = today
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [groupId, setGroupId] = useState(''); // '' = private
  const [splitOn, setSplitOn] = useState(groupId !== ''); // "Split with others" (2.0): the group and the split show once it is ticked
  const [split, setSplit] = useState<SplitState | null>(null);
  const [message, setMessage] = useState(''); // a bank message pasted to fill the form from
  const [readNote, setReadNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [batch, setBatch] = useState(false); // several pasted messages, reviewed together
  const [repeat, setRepeat] = useState(false); // also make it a payment that repeats every month
  const [kind, setKind] = useState<EntryKind>('out'); // Spent or Received (income is private and has its own categories)
  const isIn = kind === 'in';
  // Add was opened on Received (from the cash flow page or the Home card)
  useEffect(() => { if (startKind === 'in') setKind('in'); }, [startKind]);
  // Add expense was opened for one category (from the Month page): start with it, if it is one of the person's own
  useEffect(() => {
    const known = preset && app.categories.find((c) => catKey(c.name) === catKey(preset));
    if (known) { setKind('out'); setCategory(known.name); }
  }, [preset, app.categories]);
  // Add expense was opened from a group page: start with that group chosen and its usual split
  const appliedGroup = useRef('');
  useEffect(() => {
    if (!presetGroup) { appliedGroup.current = ''; return; }
    const g = app.groups.find((x) => x.id === presetGroup && !x.closed_at);
    if (!g || !app.me || appliedGroup.current === presetGroup) return;
    appliedGroup.current = presetGroup;
    setKind('out');
    setGroupId(g.id);
    setSplit(freshSplit(app.me, activeMembers(app.members, g.id), g.usual_split ?? null));
    setSplitOn(true);
  }, [presetGroup, app.groups, app.members, app.me]);
  const today = isoDate();
  const people = useMemo(() => (groupId ? activeMembers(app.members, groupId) : []), [app.members, groupId]);
  const groupName = (id: string | null) => app.groups.find((g) => g.id === id)?.name ?? 'a group';

  // Switching between Spent and Received starts the category again and drops what only spending has (group, photos, repeat).
  function pickKind(next: EntryKind) {
    setKind(next);
    setCategory('');
    setGroupId('');
    setSplitOn(false);
    setSplit(null);
    setPhotos([]);
    setRepeat(false);
    setError('');
  }

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
    setKind(p.kind);
    const cat = p.kind === 'in' ? p.incomeCategory : suggestCategory(p.merchant, app.entries, app.categories);
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

  // "450 swiggy upi" typed in one line: fills the form, saves nothing
  function fillFromLine(l: QuickLine) {
    setKind('out');
    setAmount(String(l.amount));
    setNote(l.note);
    if (l.method) pickMethod(l.method);
    setDate(l.date);
    setCategory(l.category ?? '');
    setError('');
  }

  // A message arrived in the address (#sms=..., from a phone shortcut): read it as if it had been pasted, once
  useEffect(() => {
    if (!sms || app.locked) return; // a PIN screen is up: wait, so the message is not lost on a page nobody can see
    setPasteOpen(true);
    setMessage(sms);
    readMessage(sms);
    onSms?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sms, app.locked]);

  async function pasteAndRead() {
    setPasteOpen(true);
    try {
      const text = await navigator.clipboard.readText();
      setMessage(text);
      readMessage(text);
    } catch {
      setReadNote({ text: tr('The browser did not let Hisaab read the clipboard. Paste the message into the box instead.'), bad: true });
    }
  }

  // Money received: always private, no photos, no split, no repeat. Everything else is cleared as after a payment.
  async function saveIncome(amt: number, d: string, stay: boolean) {
    await app.addEntry({ amount: amt, category, method, note: note.trim(), date: d, kind: 'in' });
    app.toast(tr('Received {0} · {1}', fmtINR(amt), category));
    clearForm(stay);
  }

  function clearForm(stay = false) {
    setPhotos([]);
    setMessage('');
    setReadNote(null);
    setAmount('');
    setNote('');
    setCategory('');
    setDate(null);
    setRepeat(false);
    setError('');
    if (stay) {
      // "Save and add another": the form stays, ready for the next one, for the same group (with a fresh split) or the same Received
      const g = groupId ? app.groups.find((x) => x.id === groupId) : undefined;
      if (g && app.me) setSplit(freshSplit(app.me, activeMembers(app.members, g.id), g.usual_split ?? null));
      amountRef.current?.focus();
      return;
    }
    setGroupId(''); // the next payment is private unless chosen otherwise
    setSplitOn(false);
    setSplit(null);
    setKind('out'); // the next one is spending unless chosen otherwise
    onSaved();
  }

  // one save at a time: a quick second tap must not save the payment twice
  const saving = useRef(false);
  const [busy, setBusy] = useState(false); // shown while a save waits on the server (a shared expense set to repeat)
  async function save(ev?: FormEvent, stay = false) {
    ev?.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try { await doSave(stay); } finally { saving.current = false; setBusy(false); }
  }

  // After a save: attach the photos, and say if they could not be.
  async function photoNote(id: string): Promise<string> {
    if (!photos.length) return '';
    try { await app.addReceipts(id, photos); return ''; } catch (e) { return tr('. The photo could not be attached: {0}', e instanceof Error ? e.message : String(e)); }
  }

  // What to say after a save: the amount and category, whether it was set to repeat, and whether the photos could be attached.
  async function saidAfter(id: string, amt: number, d: string, recur: RecurInput | null): Promise<string> {
    let toast = tr('Saved {0} · {1}', fmtINR(amt), category);
    if (recur) {
      const why = await app.addRecurring(recur, monthOf(d)); // done for the month it was logged in
      toast += why ? tr('. It could not be set to repeat: {0}', why) : tr('. It will come up every month.');
    }
    return toast + (await photoNote(id));
  }

  // 2.2: a shared expense that repeats is set up on the server together with this first month, so the month counts once for
  // everyone. Offline or refused, the expense is still saved (with the same id, so a set-up whose answer was lost is not doubled).
  async function saveRepeating(amt: number, d: string, g: NonNullable<NewEntryInput['group']>, stay: boolean) {
    const entryId = newId();
    let toast = tr('Saved {0} · {1}', fmtINR(amt), category);
    try {
      await app.addGroupRepeat({ id: newId(), groupId: g.group_id, category, note: note.trim(), amount: amt, day: Number(d.slice(8, 10)), paidBy: g.paid_by, shares: g.shares, entryId, date: d });
      toast += tr('. It comes up every month in {0}.', groupName(g.group_id));
    } catch (e) {
      await app.addEntry({ amount: amt, category, method, note: note.trim(), date: d, group: g }, entryId);
      const why = e instanceof Error ? e.message : String(e);
      // with no connection the answer may only have been lost on the way back: say so, so nobody sets it up twice
      toast += why === 'No connection' ? tr('. With no connection it may not be set to repeat: look under Every month in {0} before setting it up again.', groupName(g.group_id)) : tr('. It could not be set to repeat: {0}', why);
    }
    app.toast(toast + (await photoNote(entryId)));
    clearForm(stay);
  }

  async function doSave(stay: boolean) {
    const basics = readBasics(amount, category, date, today);
    if ('problem' in basics) return fail(basics.problem);
    const { amt, date: d } = basics;
    if (isIn) return saveIncome(amt, d, stay);
    const shared = sharedPart({ groupId, me: app.me, split, people, amt });
    if ('problem' in shared) return fail(shared.problem);
    const again = repeatPart({ repeat, groupId, category, amt, date: d, method, note: note.trim() });
    if ('problem' in again) return fail(again.problem);
    if (repeat && shared.group) return saveRepeating(amt, d, shared.group, stay);
    const id = await app.addEntry({ amount: amt, category, method, note: note.trim(), date: d, group: shared.group });
    app.toast(await saidAfter(id, amt, d, again.recur));
    clearForm(stay);
  }

  const openGroups = app.groups.filter((g) => !g.closed_at);
  const repeatGroup = repeatGroupOf(groupId, split, people, app.me, groupName);
  const groupPick = (
    <label className={ui.fieldBare}>
      <span>{tr('Group')}</span>
      <select
        value={groupId}
        onChange={(e) => {
          const id = e.target.value;
          setGroupId(id);
          setSplit(id && app.me ? freshSplit(app.me, activeMembers(app.members, id), app.groups.find((g) => g.id === id)?.usual_split ?? null) : null);
          setError('');
        }}
      >
        <option value="">{tr('Choose a group')}</option>
        {openGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>
  );
  const pasteBox = (
    <div className="flex flex-col bg-card border border-line rounded-card">
      <button type="button" className={PASTE_HEAD} aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>
        <span className="flex flex-col gap-px"><span className="text-[15px] font-[650] text-brand">{tr('Paste a payment message')}</span><span className="text-[13px] text-muted">{tr('A bank or UPI SMS. It is read here, on this device.')}</span></span>
        <span className={ui.cx('text-muted transition-transform duration-150', pasteOpen ? 'rotate-180' : 'rotate-0')} aria-hidden="true"><Icon name="down" size={20} /></span>
      </button>
      {pasteOpen && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
          <textarea
            rows={4}
            value={message}
            onChange={(e) => { setMessage(e.target.value); setReadNote(null); }}
            placeholder="Rs.450.00 debited from A/c XX4321 on 24-11-26 to VPA swiggy@icici (UPI Ref 6331)."
            aria-label={tr('Payment message')}
            spellCheck={false}
          />
          <div className="flex items-center justify-between gap-2.5">
            <button type="button" className={ui.btn('solid', 'none', 'h-11 px-5 text-[15px]')} onClick={() => { if (message.trim()) readMessage(message); else void pasteAndRead(); }}>{message.trim() ? tr('Read') : tr('Paste and read')}</button>
            <button type="button" className="min-h-11 bg-transparent border-0 p-0 text-right text-brand text-[14px] font-semibold cursor-pointer [font-family:inherit]" onClick={() => setBatch(true)}>{tr('Several messages? Review them together')}</button>
          </div>
          {readNote && <p className={ui.msg(readNote.bad ? 'bad' : undefined)} role="status">{readNote.text}</p>}
        </div>
      )}
    </div>
  );

  return (
    <form onSubmit={(ev) => { void save(ev); }} noValidate autoComplete="off" className={QL_GRID} aria-label={tr('Log a payment')}>
      <div className={QL_SIDE}>
        {pasteBox}
        {!isIn && <QuickLineBox onFill={fillFromLine} />}
        <LastAdded onSeeAll={onSeeAll} />
      </div>
      {batch && <BatchReview onClose={() => setBatch(false)} onSaved={() => { setBatch(false); onSaved(); }} />}

      <div className={QL_FORM}>
        <KindSwitch value={kind} onChange={pickKind} />

        <div>
          <label className={ui.label} htmlFor="ql-amount">{tr('Amount')}</label>
          <label className={ui.amount}>
            <span aria-hidden="true">₹</span>
            <input
              id="ql-amount"
              ref={amountRef}
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="0"
              aria-label={tr('Amount in rupees')}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
            />
          </label>
        </div>

        <CategoryChips kind={kind} value={category} onChange={(v) => { setCategory(v); setError(''); }} />

        <MethodChips value={method} onChange={pickMethod} options={METHODS} bare />

        <DateChips date={date} today={today} onChange={setDate} bare />

        <label className={ui.fieldBare}>
          <span>{tr('Note')}</span>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={tr('What was it for?')} />
        </label>

        {!isIn && app.syncEnabled && app.me && <PendingPhotos photos={photos} onChange={setPhotos} />}

        {!isIn && (
          <div className={ui.tickCard}>
            <RepeatTick checked={repeat} onChange={setRepeat} date={date ?? today} group={repeatGroup} />
            {openGroups.length > 0 && (
              <label className={ui.tickRow}>
                <input type="checkbox" checked={splitOn} onChange={(e) => { setSplitOn(e.target.checked); if (!e.target.checked) { setGroupId(''); setSplit(null); } }} />
                <span><b>{tr('Split with others')}</b><small>{tr('Add it to a group and share it.')}</small></span>
              </label>
            )}
            {splitOn && openGroups.length > 0 && (
              <div className="pt-3.5 pb-4 flex flex-col gap-3.5">
                {groupId && split && app.me ? (
                  <>
                    {app.groups.find((g) => g.id === groupId)?.kind === 'couple' && people.length === 2
                      ? <>{groupPick}<CoupleSplit people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} /></>
                      : <SplitEditor people={people} me={app.me} total={parseAmount(amount) ?? 0} value={split} onChange={(next) => { setSplit(next); setError(''); }} beside={groupPick} />}
                    <p className={ui.hint.replace('mt-1.5', 'mt-0')}>{tr('Everyone in {0} will see the amount, category, note and date, and who paid. Only your share counts toward your own budget.', groupName(groupId))}</p>
                  </>
                ) : groupPick}
              </div>
            )}
          </div>
        )}

        <p className={ui.msg('bad')} role="alert" hidden={!error}>{error}</p>
        <div className="flex flex-col gap-2.5">
          <button type="submit" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} disabled={busy}>{saveLabel(isIn, groupId !== '', busy)}</button>
          {repeatGroup && repeat && <p className="m-0 text-[13px] leading-[18px] text-muted">{repeatSaveNote(note.trim(), category, date ?? today, today)}</p>}
          <button type="button" className={ui.btn('outline', 'md')} onClick={() => { void save(undefined, true); }}>{tr('Save and add another')}</button>
        </div>
      </div>
    </form>
  );
}

// The design's Add expense: on a phone one column (the paste box and the one-line box first, then the form); from 1024px the form
// sits in a card on the left (1.45 parts) and the paste box, the one-line box and the last payments on the right (1 part).
const QL_GRID = 'grid gap-[18px] items-start lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-x-7';
const QL_SIDE = 'flex flex-col gap-[18px] lg:col-start-2 lg:row-start-1';
const QL_FORM = 'flex flex-col gap-[18px] lg:col-start-1 lg:row-start-1 lg:bg-card lg:border lg:border-line lg:rounded-card-lg lg:p-7';
const PASTE_HEAD = 'min-h-14 px-3.5 py-2.5 border-0 bg-transparent text-ink grid grid-cols-[minmax(0,1fr)_20px] gap-2.5 items-center text-left cursor-pointer [font-family:inherit]';

// The last few payments, beside the form on a wide screen (the design's "Last added").
function LastAdded({ onSeeAll }: Readonly<{ onSeeAll?: () => void }>) {
  const app = useApp();
  const last = useMemo(() => [...app.entries].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4), [app.entries]);
  if (last.length === 0) return null;
  return (
    <div className="max-lg:hidden bg-card border border-line rounded-card px-4 py-1.5">
      <div className="flex justify-between items-center min-h-11"><span className="text-[15px] font-[650]">{tr('Last added')}</span>{onSeeAll && <button type="button" className="min-h-11 -mr-2 px-2 border-0 bg-transparent text-brand text-[14px] font-semibold underline underline-offset-2 cursor-pointer [font-family:inherit]" onClick={onSeeAll}>{tr('See all')}</button>}</div>
      {last.map((e) => {
        const [head] = e.note.split(' · ');
        return (
          <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-14 border-t border-line">
            <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{head || e.category}</span><span className="text-[13px] text-muted truncate">{[head ? e.category : '', shortDate(e.entry_date), e.method ?? ''].filter(Boolean).join(' · ')}</span></span>
            <span className="text-[15px] font-bold tabular-nums">{fmtINR(e.amount)}</span>
          </div>
        );
      })}
    </div>
  );
}
