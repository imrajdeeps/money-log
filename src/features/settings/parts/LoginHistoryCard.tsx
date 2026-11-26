import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { SyncError } from '../../../data/syncTypes.ts';
import { dateTimeLabel } from '../../../core/format.ts';
import { agoText, deviceName, eventLabel } from '../../../core/signins.ts';
import type { SessionInfo, SignInEvent } from '../../../core/signins.ts';
import { Icon } from '../../../ui/Icon.tsx';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

type Record_ = { sessions: SessionInfo[]; log: SignInEvent[] };

// The text for a failed load. A 404 means the database has not had the version 1.25 SQL yet.
function problemText(e: unknown): string {
  if (e instanceof SyncError && e.kind === 'http' && e.status === 404) return tr('Not available yet: the database needs the latest update (the sign-in record functions).');
  return e instanceof Error ? e.message : tr('Could not load the sign-in record.');
}

function SessionRow({ s, now }: Readonly<{ s: SessionInfo; now: number }>) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-16 py-2">
      <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{deviceName(s.userAgent)}</span><span className="text-[13px] text-muted">{tr('Signed in {0} · last active {1}', dateTimeLabel(s.createdMs), agoText(now, s.lastMs))}</span></span>
      {s.isCurrent ? <span className="rounded-md bg-good-bg px-2 py-[3px] text-[12px] font-semibold text-good">{tr('This phone')}</span> : <span />}
    </li>
  );
}

type SignOut = 'others' | 'everywhere';

// Settings, Password and sessions: where the account is signed in now (device and browser, from the live sessions), signing out
// the others (or everywhere, after a second tap), and what happened to it lately (the server's own record; no addresses).
export function LoginHistoryCard() {
  const app = useApp();
  const [data, setData] = useState<Record_ | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<SignOut | null>(null); // a sign-out waits for a second tap
  const [done, setDone] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setProblem('');
    try {
      const [sessions, log] = await Promise.all([app.loadSessions(), app.loadSignInLog(30)]);
      setData({ sessions, log });
    } catch (e) {
      setProblem(problemText(e));
    } finally {
      setBusy(false);
    }
  }, [app.loadSessions, app.loadSignInLog]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  async function signOut(which: SignOut) {
    if (ask !== which) { setAsk(which); return; }
    setAsk(null); setBusy(true); setDone('');
    try {
      if (which === 'everywhere') { await app.signOutEverywhere(); app.toast(tr('Signed out everywhere')); return; }
      await app.signOutOthers();
      setDone(tr('Your other devices are signed out. A device that is open right now is signed out the next time it renews its sign-in, within about an hour.'));
      await load();
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const now = Date.now();
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className={ps.title}>{tr('Signed in on')}</h3>
        {problem && <p className={ui.msg('bad')} role="alert">{problem}</p>}
        {data && (data.sessions.length === 0
          ? <p className={ps.note}>{tr('Nothing is signed in right now.')}</p>
          : <ul className="list-none m-0 pl-4 pr-3 bg-card border border-line rounded-card [&>li+li]:border-t [&>li+li]:border-line">{data.sessions.map((s) => <SessionRow key={s.id} s={s} now={now} />)}</ul>)}
        {done && <p className={ui.msg('good')} role="status">{done}</p>}
        <button type="button" className={ui.btn('outline', 'none', ps.second)} disabled={busy} onClick={() => { void signOut('others'); }}>{ask === 'others' ? tr('Tap again: sign out other devices') : tr('Sign out everywhere else')}</button>
        <button type="button" className="self-center min-h-11 px-2 border-0 bg-transparent text-bad text-[14px] font-semibold cursor-pointer [font-family:inherit] disabled:opacity-50" disabled={busy} onClick={() => { void signOut('everywhere'); }}>{ask === 'everywhere' ? tr('Tap again: sign out everywhere') : tr('Sign out everywhere, this phone too')}</button>
        {ask && <button type="button" className="self-center min-h-11 px-2 border-0 bg-transparent text-brand text-[14px] font-semibold cursor-pointer [font-family:inherit]" onClick={() => setAsk(null)}>{tr('Cancel')}</button>}
      </section>
      {data && data.log.length > 0 && (
        <details className="group bg-card border border-line rounded-card px-4">
          <summary className="min-h-[52px] flex items-center justify-between cursor-pointer text-[15px] font-[650] list-none [&::-webkit-details-marker]:hidden">{tr('Recent activity')}<span className="text-muted transition-transform group-open:rotate-180"><Icon name="down" size={18} /></span></summary>
          <ul className="list-none m-0 p-0 pb-2">
            {data.log.map((e, i) => (
              <li key={`${e.atMs}-${e.action}-${i}`} className="min-h-9 flex items-center justify-between gap-3 text-[14px]">
                <span>{eventLabel(e.action)}</span>
                <span className="flex-none text-[13px] text-muted">{dateTimeLabel(e.atMs)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="mb-3 min-h-10 px-0 border-0 bg-transparent text-brand text-[14px] font-semibold cursor-pointer [font-family:inherit]" disabled={busy} onClick={() => { void load(); }}>{busy ? tr('Loading…') : tr('Refresh')}</button>
        </details>
      )}
    </>
  );
}
