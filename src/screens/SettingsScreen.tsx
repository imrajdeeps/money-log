import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useApp } from '../context.tsx';
import { makeBackup, parseBackup } from '../backup.ts';
import { parseBlockText } from '../blocks.ts';
import { readTextFile, saveFile } from '../files.ts';
import { clockLabel, monthLabel, shortDate, stamp } from '../format.ts';
import { GROUPS } from '../logic.ts';
import { LOCK_TIMEOUTS, validPin } from '../lock.ts';
import { MIN_PASSWORD } from '../password.ts';
import { quota, sizeText, usedBytes } from '../receipts.ts';

export const VERSION = '5.0.0';
const importedOn = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function AccountCard() {
  const app = useApp();
  const s = app.sync;
  const [how, setHow] = useState<'signin' | 'signup' | 'code'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false); // the sign-out choice is showing
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  function choose(next: 'signin' | 'signup' | 'code') {
    setHow(next); setMsg(null); setSent(false); setCode(''); setPassword2('');
  }

  async function signIn(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await app.signInWithPassword(email.trim(), password);
      setPassword('');
      app.toast('Signed in');
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function signUp(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) { setMsg({ text: 'The two passwords are not the same.', bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await app.signUp(email.trim(), password);
      setPassword(''); setPassword2('');
      if (r === 'signed-in') app.toast('Account created');
      else setMsg({ text: `Almost there: open the confirmation link we emailed to ${email.trim()}, then come back and sign in. If you already have an account with this address, just sign in.`, bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function sendCode() {
    setBusy(true); setMsg(null);
    try {
      await app.requestCode(email.trim());
      setSent(true);
      setMsg({ text: `We emailed a 6-digit code to ${email.trim()}. It can take a minute.`, bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setMsg(null);
    try {
      await app.verifyCode(email.trim(), code);
      setCode(''); setSent(false); setMsg(null);
      app.toast('Signed in');
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  if (!app.syncEnabled) {
    return (
      <div className="card">
        <h2>Cloud sync</h2>
        <p className="muted">Cloud sync is not set up in this build, so payments stay on this phone only. The README explains how to turn it on.</p>
      </div>
    );
  }

  if (s.mode === 'signedout') {
    const note = (msg || s.error) && <p className={`msg ${msg?.bad || !msg ? 'bad' : ''}`} role="alert">{msg?.text ?? s.error}</p>;
    return (
      <div className="card">
        <h2>{how === 'signup' ? 'Create an account' : 'Sign in to sync'}</h2>
        <p className="muted small">Your payments are saved on this phone either way. Signing in only adds the cloud copy and your other devices.</p>
        <div className="chips" role="group" aria-label="How to sign in">
          <button type="button" className="chip" aria-pressed={how === 'signin'} onClick={() => choose('signin')}>Sign in</button>
          <button type="button" className="chip" aria-pressed={how === 'signup'} onClick={() => choose('signup')}>Create account</button>
          <button type="button" className="chip" aria-pressed={how === 'code'} onClick={() => choose('code')}>Email code</button>
        </div>
        {how === 'signin' && (
          <form onSubmit={signIn} noValidate>
            <label className="field">
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </label>
            {note}
            <div className="btnrow">
              <button type="submit" className="btn" disabled={busy || !email.trim() || !password}>Sign in</button>
            </div>
            <p className="muted small">Forgot your password? <button type="button" className="linkbtn" onClick={() => choose('code')}>Get an email code</button>, sign in with it, then set a new password under Password and sessions.</p>
          </form>
        )}
        {how === 'signup' && (
          <form onSubmit={signUp} noValidate>
            <label className="field">
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            <label className="field">
              <span>Password (at least {MIN_PASSWORD} characters)</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </label>
            <label className="field">
              <span>Repeat the password</span>
              <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} disabled={busy} />
            </label>
            {note}
            <div className="btnrow">
              <button type="submit" className="btn" disabled={busy || !email.trim() || !password || !password2}>Create account</button>
            </div>
            <p className="muted small">A few words in a row make a strong password. There is no way to recover it from the app: if you forget it, use an email code.</p>
          </form>
        )}
        {how === 'code' && (
          <>
            <p className="muted small">No password: we email you a 6-digit code.</p>
            <label className="field">
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            </label>
            {sent && (
              <label className="field">
                <span>6-digit code</span>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} />
              </label>
            )}
            {note}
            <div className="btnrow">
              {!sent ? (
                <button type="button" className="btn" disabled={busy || !email.trim()} onClick={sendCode}>Send code</button>
              ) : (
                <>
                  <button type="button" className="btn" disabled={busy || !code.trim()} onClick={verify}>Sign in</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={sendCode}>Send again</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Cloud sync</h2>
      <p>Signed in as <b>{s.email}</b></p>
      <p className="muted small">
        {s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to upload. ` : 'Everything is uploaded. '}
        {s.lastSync ? `Last sync ${clockLabel(s.lastSync)}.` : ''}
        {s.mode === 'offline' ? ' You are offline; it will catch up when the connection returns.' : ''}
      </p>
      {s.error && <p className="msg bad" role="alert">{s.error}</p>}
      <div className="btnrow">
        <button type="button" className="btn" onClick={app.syncNow} disabled={s.mode === 'syncing'}>Sync now</button>
        <button type="button" className="btn ghost" aria-expanded={leaving} onClick={() => setLeaving(!leaving)}>Sign out</button>
      </div>
      {leaving && (
        <div className="newcat" role="group" aria-label="Sign out">
          <p><b>Also erase this phone's copy of your data?</b></p>
          <p className="muted small">
            Erase it before someone else uses this phone or you sign in with another account. Everything already in the cloud stays there
            and comes back when you sign in again. Keep it if this is still your phone and you will sign back in.
          </p>
          {s.pending > 0 && (
            <p className="msg bad" role="alert">
              {s.pending} change{s.pending === 1 ? ' has' : 's have'} not reached the cloud. Erasing loses {s.pending === 1 ? 'it' : 'them'}; signing out and keeping the data does not.
            </p>
          )}
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => { void app.signOut(); }}>Sign out, keep the data</button>
          </div>
          <div className="btnrow">
            <button type="button" className="btn danger" onClick={async () => { await app.eraseAll(); app.toast('Signed out and erased this phone.'); }}>Sign out and erase this phone</button>
          </div>
          <div className="btnrow">
            <button type="button" className="btn ghost" onClick={() => setLeaving(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordCard() {
  const app = useApp();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | 'others' | 'everywhere'>(null); // a sign-out waits for a second tap
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  if (!app.syncEnabled || app.sync.mode === 'signedout' || app.sync.mode === 'local') return null;

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) { setMsg({ text: 'The two passwords are not the same.', bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      await app.changePassword(password);
      setPassword(''); setPassword2('');
      setMsg({ text: 'Password saved. You can now sign in with your email and this password.', bad: false });
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  async function signOutFrom(which: 'others' | 'everywhere') {
    if (ask !== which) { setAsk(which); return; }
    setBusy(true); setMsg(null); setAsk(null);
    try {
      if (which === 'others') {
        await app.signOutOthers();
        setMsg({ text: 'Your other devices are signed out. A device that is open right now is signed out the next time it renews its sign-in, within about an hour.', bad: false });
      } else {
        await app.signOutEverywhere();
        app.toast('Signed out everywhere');
      }
    } catch (e) { setMsg({ text: errText(e), bad: true }); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Password and sessions</h2>
      <form onSubmit={save} noValidate>
        <p className="muted small">Set a password to sign in without an email code, or change it. Others cannot see it and it is not kept on this phone.</p>
        <label className="field">
          <span>New password (at least {MIN_PASSWORD} characters)</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} disabled={busy} />
        </label>
        <label className="field">
          <span>Repeat the new password</span>
          <input type="password" autoComplete="new-password" value={password2} onChange={(e) => { setPassword2(e.target.value); setMsg(null); }} disabled={busy} />
        </label>
        <div className="btnrow">
          <button type="submit" className="btn" disabled={busy || !password || !password2}>Save password</button>
        </div>
      </form>
      {msg && <p className={`msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <h3 className="h2">Where you are signed in</h3>
      <p className="muted small">
        This phone stays signed in and renews its sign-in by itself until you sign out. If you lose a phone, sign out your other devices
        here, or everywhere, then change the password.
      </p>
      <div className="btnrow">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { void signOutFrom('others'); }}>
          {ask === 'others' ? 'Tap again: sign out other devices' : 'Sign out my other devices'}
        </button>
      </div>
      <div className="btnrow">
        <button type="button" className="btn danger" disabled={busy} onClick={() => { void signOutFrom('everywhere'); }}>
          {ask === 'everywhere' ? 'Tap again: sign out everywhere' : 'Sign out everywhere, this phone too'}
        </button>
      </div>
      {ask && <button type="button" className="btn ghost small" onClick={() => setAsk(null)}>Cancel</button>}
    </div>
  );
}

function PlanCard() {
  const app = useApp();
  const [text, setText] = useState('');
  const [fileErr, setFileErr] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseBlockText(text) : null), [text]);
  const { plan: p, due, net } = app;

  async function pickFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try { setText(await readTextFile(f)); setFileErr(''); } catch (e) { setFileErr(errText(e)); }
  }

  async function apply() {
    if (!parsed?.ok) return;
    if (parsed.kind === 'budget') await app.applyPlan(parsed.plan);
    else if (parsed.kind === 'due') await app.applyDue(parsed.data);
    else await app.applyNet(parsed.data);
    app.toast(parsed.kind === 'budget' ? 'Plan imported' : parsed.kind === 'due' ? 'Due list imported' : 'Net worth and goals imported');
    setText('');
  }

  const replacing = parsed?.ok && ((parsed.kind === 'budget' && p) || (parsed.kind === 'due' && due) || (parsed.kind === 'networth' && net));

  return (
    <div className="card">
      <h2>Spreadsheet plan (optional)</h2>
      <p className="muted small">
        The app works on its own: it has built-in categories and you can add your own and set budgets under Month.
        If you also keep the spreadsheet, import its blocks here. The spreadsheet's categories, groups and planned amounts then
        take over for the months it covers, and nothing you logged changes.
      </p>
      <ul className="facts small">
        <li><b>Budget</b>: {p ? `${p.rows.length} categories, ${monthLabel(p.months[0] ?? '')} to ${monthLabel(p.months[p.months.length - 1] ?? '')}. Imported ${importedOn(p.importedAt)}.` : 'not imported. Optional: the app has its own categories and budgets.'}</li>
        <li><b>Due list</b>: {due ? `${due.items.length} items. Imported ${importedOn(due.importedAt)}.` : 'not imported.'}</li>
        <li><b>Net worth and goals</b>: {net ? `${net.items.length} figures${net.asOf ? ` for ${monthLabel(net.asOf.slice(0, 7))}` : ''}. Imported ${importedOn(net.importedAt)}.` : 'not imported.'}</li>
      </ul>
      <ol className="steps muted small">
        <li>In the spreadsheet's <b>App export</b> tab, copy one block: the budget <b>A5 to AL34</b>, the due list <b>A38 to E66</b>, or net worth and goals <b>A70 to C79</b>.</li>
        <li>Paste it below, or choose a .tsv/.csv file. The app recognises which block it is. Importing replaces that block only and never touches your payments.</li>
      </ol>
      <textarea className="preview" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Block pasted from the spreadsheet" placeholder="Paste the block here" spellCheck={false} />
      <label className="btn ghost filebtn">
        Choose a file
        <input type="file" accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values" onChange={pickFile} />
      </label>
      {fileErr && <p className="msg bad" role="alert">{fileErr}</p>}
      {parsed && !parsed.ok && <p className="msg bad" role="alert">{parsed.error}</p>}
      {parsed?.ok && parsed.kind === 'budget' && (
        <div className="msg good" role="status">
          <p>Budget block: <b>{parsed.summary.categories}</b> categories for <b>{parsed.summary.months}</b> months ({monthLabel(parsed.summary.first)} to {monthLabel(parsed.summary.last)}).</p>
          <p className="small">{GROUPS.map((g) => `${g}: ${parsed.summary.byGroup[g]}`).join(' · ')}</p>
        </div>
      )}
      {parsed?.ok && parsed.kind === 'due' && (
        <div className="msg good" role="status">
          <p>Due list: <b>{parsed.summary.oneoffs}</b> one-off payment{parsed.summary.oneoffs === 1 ? '' : 's'} and <b>{parsed.summary.todos}</b> to-do{parsed.summary.todos === 1 ? '' : 's'}{parsed.summary.undated ? `, ${parsed.summary.undated} without a date` : ''}.</p>
          <p className="small">Next: {parsed.data.items.filter((i) => i.due && !i.done).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')).slice(0, 1).map((i) => `${i.title} (${shortDate(i.due!)})`).join('') || 'nothing dated'}. Done marks you made in the app are kept for items that are still on the list.</p>
        </div>
      )}
      {parsed?.ok && parsed.kind === 'networth' && (
        <div className="msg good" role="status">
          <p>Net worth and goals: <b>{parsed.summary.items}</b> figures{parsed.summary.asOf ? ` for ${monthLabel(parsed.summary.asOf.slice(0, 7))}` : ''}.</p>
        </div>
      )}
      <button type="button" className="btn" disabled={!parsed?.ok} onClick={apply}>{replacing ? 'Replace this block' : 'Import this block'}</button>
    </div>
  );
}

function ReceiptsCard() {
  const app = useApp();
  const used = usedBytes(app.receipts);
  const q = quota(used);
  const count = app.receipts.filter((r) => !r.deleted_at).length;
  return (
    <div className="card">
      <h2>Receipt photos</h2>
      <p className="muted small">
        {count} photo{count === 1 ? '' : 's'} · {sizeText(used)} in the cloud, of the free 1 GB (this counts every photo you can see, yours and shared ones, so it is an estimate for the whole project).
        Each photo is shrunk to at most 1,600 pixels and 1 MB, and its location and camera details are removed before upload. An account can keep up to 300 photos.
      </p>
      <div className="bar" aria-hidden="true"><i className={q.level === 'ok' ? 'good' : 'bad'} style={{ width: `${q.pct}%` }} /></div>
      {q.level !== 'ok' && (
        <p className="msg bad" role="alert">
          {q.level === 'full' ? 'The free storage is full.' : 'The free storage is more than 80% full.'} Delete old photos you no longer need, or upgrade the Supabase plan.
        </p>
      )}
      <p className="muted small">Photos are not part of the backup file or the spreadsheet export.</p>
    </div>
  );
}

function AppLockCard() {
  const app = useApp();
  const on = app.lock;
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [cur, setCur] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(on?.timeoutSec ?? 60);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  useEffect(() => { if (on) setTimeoutSec(on.timeoutSec); }, [on]);
  const clear = () => { setPin(''); setPin2(''); setCur(''); };
  const fail = (text: string) => setMsg({ text, bad: true });

  async function turnOn() {
    if (!validPin(pin)) return fail('A PIN is 4 to 8 digits.');
    if (pin !== pin2) return fail('The two PINs are not the same.');
    await app.setPin(pin, timeoutSec);
    clear();
    setMsg({ text: 'PIN lock is on. It will ask for the PIN from now on.', bad: false });
  }

  async function save() {
    if (pin && !validPin(pin)) return fail('A PIN is 4 to 8 digits.');
    if (pin && pin !== pin2) return fail('The two new PINs are not the same.');
    const err = await app.updateLock(cur, { ...(pin ? { pin } : {}), timeoutSec });
    if (err) return fail(err);
    clear();
    setMsg({ text: 'Saved.', bad: false });
  }

  async function turnOff() {
    if (!window.confirm('Turn the PIN lock off?')) return;
    const err = await app.updateLock(cur, 'remove');
    if (err) return fail(err);
    clear();
    setMsg({ text: 'PIN lock is off.', bad: false });
  }

  const timeouts = (
    <label className="field">
      <span>Ask for the PIN</span>
      <select value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))}>
        {LOCK_TIMEOUTS.map((t) => <option key={t.sec} value={t.sec}>{t.label}</option>)}
      </select>
    </label>
  );
  const pinFields = (label: string) => (
    <>
      <label className="field"><span>{label}</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="field"><span>Same PIN again</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></label>
    </>
  );

  return (
    <div className="card">
      <h2>App lock</h2>
      <p className="muted small">
        A PIN screen that covers the app when it opens and when you come back after a while. It stops someone glancing at your
        unlocked phone. It does <b>not</b> encrypt the data stored on the phone, so your phone's own lock is still what protects it.
        If you forget the PIN, the only way back in is to erase this phone's copy and sign in again.
      </p>
      {!on ? (
        <>
          {pinFields('New PIN (4 to 8 digits)')}
          {timeouts}
          {msg && <p className={`msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
          <button type="button" className="btn" disabled={!pin} onClick={() => { void turnOn(); }}>Turn on PIN lock</button>
        </>
      ) : (
        <>
          <p><b>On.</b> {LOCK_TIMEOUTS.find((t) => t.sec === on.timeoutSec)?.label ?? ''}.</p>
          <label className="field"><span>Current PIN (needed to change anything)</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ''))} /></label>
          {timeouts}
          {pinFields('New PIN (leave empty to keep the current one)')}
          {msg && <p className={`msg ${msg.bad ? 'bad' : 'good'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
          <div className="btnrow">
            <button type="button" className="btn" disabled={!cur} onClick={() => { void save(); }}>Save changes</button>
            <button type="button" className="btn danger" disabled={!cur} onClick={() => { void turnOff(); }}>Turn off</button>
          </div>
        </>
      )}
    </div>
  );
}

function BackupCard() {
  const app = useApp();
  const [msg, setMsg] = useState('');

  async function download() {
    const body = JSON.stringify(makeBackup(app.allEntries, app.plan, new Date().toISOString(), { due: app.due, networth: app.net, dueDone: app.doneMap, categories: app.mine }), null, 2);
    const r = await saveFile(`money-log-backup-${stamp()}.json`, body, 'application/json');
    if (r !== 'cancelled') app.toast(r === 'shared' ? 'Backup shared.' : 'Backup downloaded.');
  }

  async function restore(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = parseBackup(await readTextFile(f, 20_000_000));
      if (!r.ok) { setMsg(r.error); return; }
      if (!window.confirm(`Restore from this backup? It holds ${r.entries.length} payment${r.entries.length === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} that can't be read will be skipped)` : ''}. Payments already here stay unless the backup copy is newer.`)) return;
      const res = await app.restoreBackup(r);
      setMsg(`Restored: ${res.added} added, ${res.updated} updated${res.blocksReplaced ? `, ${res.blocksReplaced} plan block${res.blocksReplaced === 1 ? '' : 's'} replaced` : ''}.`);
    } catch (e) { setMsg(errText(e)); }
  }

  return (
    <div className="card">
      <h2>Backup</h2>
      <p className="muted small">A file with all your payments and the plan. Keep one somewhere safe (iCloud Drive, for example) from time to time.</p>
      <div className="btnrow">
        <button type="button" className="btn" onClick={download}>Download backup</button>
        <label className="btn ghost filebtn">
          Restore
          <input type="file" accept=".json,application/json" onChange={restore} />
        </label>
      </div>
      {msg && <p className="msg" role="status">{msg}</p>}
    </div>
  );
}

function DangerCard() {
  const app = useApp();
  async function erase() {
    const waiting = app.sync.pending;
    const warn = waiting ? `\n\n${waiting} change${waiting === 1 ? ' has' : 's have'} not reached the cloud and will be lost.` : '';
    if (!window.confirm(`Erase everything on this phone and sign out? Data already in the cloud is not touched.${warn}`)) return;
    await app.eraseAll();
    app.toast('This phone has been erased.');
  }
  return (
    <div className="card">
      <h2>Erase</h2>
      <p className="muted small">Removes the payments, plan and sign-in stored on this phone. Use it before handing the phone to someone or signing in with another account.</p>
      <button type="button" className="btn danger" onClick={erase}>Erase everything on this phone</button>
    </div>
  );
}

function AboutCard() {
  const app = useApp();
  return (
    <div className="card">
      <h2>About</h2>
      <p className="muted small">Money Log {VERSION} · Release 5. Amounts are in rupees.</p>
      {app.storageKind === 'memory' && (
        <p className="msg bad" role="alert">This browser would not let the app store data, so payments will be lost when you close it. Open it in a normal (not private) window.</p>
      )}
      <p className="muted small"><b>Install:</b> on iPhone, open this page in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, tap the menu, then Install app.</p>
    </div>
  );
}

export function SettingsScreen() {
  return (
    <section aria-label="Settings">
      <AccountCard />
      <PasswordCard />
      <PlanCard />
      <ReceiptsCard />
      <AppLockCard />
      <BackupCard />
      <DangerCard />
      <AboutCard />
    </section>
  );
}
