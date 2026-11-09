import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../context.tsx';
import { readTextFile, saveFile } from '../files.ts';
import { clockLabel, monthLabel, stamp } from '../format.ts';
import { GROUPS, makeBackup, parseBackup, parsePlanText } from '../logic.ts';

export const VERSION = '1.0.0';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function AccountCard() {
  const app = useApp();
  const s = app.sync;
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

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
    return (
      <div className="card">
        <h2>Sign in to sync</h2>
        <p className="muted small">No password: we email you a code. Your payments are saved on this phone either way.</p>
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
        {(msg || s.error) && <p className={`msg ${msg?.bad || !msg ? 'bad' : ''}`} role="alert">{msg?.text ?? s.error}</p>}
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
        <button type="button" className="btn ghost" onClick={() => { void app.signOut(); }}>Sign out</button>
      </div>
    </div>
  );
}

function PlanCard() {
  const app = useApp();
  const [text, setText] = useState('');
  const [fileErr, setFileErr] = useState('');
  const parsed = useMemo(() => (text.trim() ? parsePlanText(text) : null), [text]);
  const p = app.plan;

  async function pickFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try { setText(await readTextFile(f)); setFileErr(''); } catch (e) { setFileErr(errText(e)); }
  }

  async function apply() {
    if (!parsed?.ok) return;
    await app.applyPlan(parsed.plan);
    app.toast('Plan imported');
    setText('');
  }

  return (
    <div className="card">
      <h2>Plan</h2>
      <p className="muted small">
        {p
          ? `${p.rows.length} categories, ${monthLabel(p.months[0] ?? '')} to ${monthLabel(p.months[p.months.length - 1] ?? '')}. Imported ${new Date(p.importedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`
          : 'No plan yet. The category list and the monthly budgets come from the spreadsheet.'}
      </p>
      <ol className="steps muted small">
        <li>In the spreadsheet, open the <b>App export</b> tab and copy <b>A5 to AL34</b>.</li>
        <li>Paste it below, or choose a .tsv/.csv file. Importing replaces the previous plan and never touches your payments.</li>
      </ol>
      <textarea className="preview" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Plan block pasted from the spreadsheet" placeholder="Paste the block here" spellCheck={false} />
      <label className="btn ghost filebtn">
        Choose a file
        <input type="file" accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values" onChange={pickFile} />
      </label>
      {fileErr && <p className="msg bad" role="alert">{fileErr}</p>}
      {parsed && !parsed.ok && <p className="msg bad" role="alert">{parsed.error}</p>}
      {parsed?.ok && (
        <div className="msg good" role="status">
          <p>Ready to import: <b>{parsed.summary.categories}</b> categories for <b>{parsed.summary.months}</b> months ({monthLabel(parsed.summary.first)} to {monthLabel(parsed.summary.last)}).</p>
          <p className="small">{GROUPS.map((g) => `${g}: ${parsed.summary.byGroup[g]}`).join(' · ')}</p>
        </div>
      )}
      <button type="button" className="btn" disabled={!parsed?.ok} onClick={apply}>{p ? 'Replace plan' : 'Import plan'}</button>
    </div>
  );
}

function BackupCard() {
  const app = useApp();
  const [msg, setMsg] = useState('');

  async function download() {
    const body = JSON.stringify(makeBackup(app.allEntries, app.plan, new Date().toISOString()), null, 2);
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
      const res = await app.restoreBackup(r.entries, r.plan);
      setMsg(`Restored: ${res.added} added, ${res.updated} updated${res.planReplaced ? ', plan replaced' : ''}.`);
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
      <p className="muted small">Money Log {VERSION} · Release 1. Amounts are in rupees.</p>
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
      <PlanCard />
      <BackupCard />
      <DangerCard />
      <AboutCard />
    </section>
  );
}
