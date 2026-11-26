import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { useProfile } from '../../data/useProfile.ts';
import { isoDate } from '../../core/logic.ts';
import { checkUdhaar } from '../../core/udhaar.ts';
import type { UdhaarInput } from '../../core/udhaar.ts';
import type { CircleMember } from '../../core/circle.ts';
import type { UdhaarItem, UdhaarWay } from '../../core/goals.ts';
import { WhoField } from './WhoField.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The share tick under the name (version 2.0): shown only for someone picked from the Circle, ticked unless the person unticks it.
function ShareTick({ name, on, onChange }: Readonly<{ name: string; on: boolean; onChange: (v: boolean) => void }>) {
  return (
    <div className="mt-3 px-3.5 py-2.5 border border-line rounded-[14px]">
      <label className={ui.check}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-semibold">{tr('Share with {0}', name)}</span>
      </label>
      <p className="text-muted text-[13px] m-0">{on ? tr('{0} gets it in their Udhaar to accept. Once accepted, either of you can mark it settled, and both see it.', name) : tr('Off: this entry is private, only you see it.')}</p>
    </div>
  );
}

// Sends an entry to someone in the Circle: checked here first with the same rules as a private one, then kept by the server.
async function shareEntry(app: ReturnType<typeof useApp>, who: CircleMember, input: UdhaarInput, myName: string): Promise<string | null> {
  const c = checkUdhaar(input, isoDate());
  if (!c.ok) return c.error;
  try {
    await app.sharedUdhaar.share({ other: who.user_id, way: c.way, amount: c.amount, date: c.date, note: c.note, myName, theirName: c.name });
    return null;
  } catch (e) {
    return e instanceof Error && e.message === 'No connection' ? tr('You are offline. Sharing needs a connection; untick Share to keep the entry private.') : (e instanceof Error ? e.message : String(e));
  }
}

// Money lent or borrowed: which way, with whom, how much, when, and a note. Your Circle and the names already used are offered as the
// person types; picking someone from the Circle offers to share the entry with them (version 2.0).
export function UdhaarForm({ item, circle, onDone, onShared }: Readonly<{ item?: UdhaarItem; circle: readonly CircleMember[]; onDone: () => void; onShared: () => void }>) {
  const app = useApp();
  const profile = useProfile();
  const [way, setWay] = useState<UdhaarWay>(item?.w ?? 'gave');
  const [name, setName] = useState(item?.n ?? '');
  const [picked, setPicked] = useState<CircleMember | null>(null);
  const [share, setShare] = useState(true);
  const [amount, setAmount] = useState(item ? String(item.a) : '');
  const [date, setDate] = useState(item?.d ?? isoDate());
  const [note, setNote] = useState(item?.m ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const names = [...new Set(app.udhaar.map((u) => u.n))];
  const sharing = !item && picked !== null && share;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    const input = { name, amount, way, date, note };
    let problem: string | null;
    if (sharing && picked) problem = await shareEntry(app, picked, input, profile.name);
    else problem = item ? await app.editUdhaar(item.id, input) : await app.addUdhaar(input);
    setBusy(false);
    if (problem) return setError(problem);
    app.toast(sharing ? tr('Sent to {0}', name.trim()) : item ? tr('Saved') : tr('Added'));
    if (sharing) onShared();
    onDone();
  }

  return (
    <form className={ui.card()} onSubmit={(ev) => { void submit(ev); }} noValidate>
      <h2>{item ? tr('Change entry') : tr('New entry')}</h2>
      <div className={ui.chips} role="group" aria-label={tr('Which way')}>
        <button type="button" className={ui.chip} aria-pressed={way === 'gave'} onClick={() => setWay('gave')}>{tr('I lent')}</button>
        <button type="button" className={ui.chip} aria-pressed={way === 'took'} onClick={() => setWay('took')}>{tr('I borrowed')}</button>
      </div>
      <WhoField label={way === 'gave' ? tr('Lent to') : tr('Borrowed from')} value={name} picked={picked} circle={item ? [] : circle} used={names}
        onChange={(v) => { setName(v); setPicked(null); setError(''); }} onPick={(who, n) => { setName(n); setPicked(who); setShare(true); setError(''); }} />
      {!item && picked && <ShareTick name={name} on={share} onChange={setShare} />}
      {!item && !picked && name.trim() !== '' && circle.length > 0 && <p className="text-muted text-[13px] mt-2 mb-0">{tr('Not in your Circle: this entry is private, only you see it.')}</p>}
      <label className={ui.field}><span>{tr('Amount (₹)')}</span><input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Date')}</span><input type="date" value={date} max={isoDate()} onChange={(e) => { setDate(e.target.value); setError(''); }} /></label>
      <label className={ui.field}><span>{tr('Note (optional)')}</span><input value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      <div className={ui.btnRow}>
        <button type="submit" className={ui.btn()} disabled={busy}>{sharing ? tr('Save and send to {0}', name.trim()) : tr('Save')}</button>
        <button type="button" className={ui.btn('ghost')} disabled={busy} onClick={onDone}>{tr('Cancel')}</button>
      </div>
    </form>
  );
}
