import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { SyncError } from '../../../data/syncTypes.ts';
import { dateTimeLabel } from '../../../core/format.ts';
import { agoText, deviceName, eventLabel } from '../../../core/signins.ts';
import type { SessionInfo, SignInEvent } from '../../../core/signins.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

type Record_ = { sessions: SessionInfo[]; log: SignInEvent[] };

// The text for a failed load. A 404 means the database has not had the version 1.25 SQL yet.
function problemText(e: unknown): string {
  if (e instanceof SyncError && e.kind === 'http' && e.status === 404) return tr('Not available yet: the database needs the latest update (the sign-in record functions).');
  return e instanceof Error ? e.message : tr('Could not load the sign-in record.');
}

function SessionRow({ s, now }: Readonly<{ s: SessionInfo; now: number }>) {
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <b className="[overflow-wrap:anywhere]">{deviceName(s.userAgent)}</b>
        {s.isCurrent && <span className="flex-none rounded-full bg-good-bg px-2.5 py-0.5 text-[12px] font-bold text-good">{tr('This phone')}</span>}
      </div>
      <small className="text-muted">{tr('Signed in {0} · last active {1}', dateTimeLabel(s.createdMs), agoText(now, s.lastMs))}</small>
    </li>
  );
}

// Settings, Password and sessions: where the account is signed in now (device and browser, from the live sessions) and what
// happened to it lately (the server's own record: sign-ins, password changes, sign-outs; no addresses).
export function LoginHistoryCard() {
  const app = useApp();
  const [data, setData] = useState<Record_ | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
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
  const now = Date.now();
  return (
    <div className={ui.card()}>
      <h2>{tr('Login history')}</h2>
      <p className="text-muted text-[13px]">{tr('Where your account is signed in, and what happened to it lately. It comes from the server, so it cannot be changed from here. If you see a sign-in you do not know, change your password and sign out other devices.')}</p>
      {problem && <p className={ui.msg('bad')} role="alert">{problem}</p>}
      {data && (
        <>
          <h3 className="mb-2 mt-4 text-[16px]">{tr('Signed in now')}</h3>
          {data.sessions.length === 0 ? <p className="text-muted">{tr('Nothing is signed in right now.')}</p> : <ul className={ui.list()}>{data.sessions.map((s) => <SessionRow key={s.id} s={s} now={now} />)}</ul>}
          <h3 className="mb-2 mt-4 text-[16px]">{tr('Recent activity')}</h3>
          {data.log.length === 0 ? (
            <p className="text-muted">{tr('No sign-in record yet.')}</p>
          ) : (
            <ul className={ui.list()}>
              {data.log.map((e, i) => (
                <li key={`${e.atMs}-${e.action}-${i}`} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                  <span>{eventLabel(e.action)}</span>
                  <small className="flex-none text-muted">{dateTimeLabel(e.atMs)}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} disabled={busy} onClick={() => { void load(); }}>{busy ? tr('Loading…') : tr('Refresh')}</button>
    </div>
  );
}
