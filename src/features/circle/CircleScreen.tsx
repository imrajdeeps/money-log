import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { copyText } from '../../ui/files.ts';
import { circleHow, circleLink, circleName, sortCircle } from '../../core/circle.ts';
import type { CircleMember } from '../../core/circle.ts';
import { codeLooksValid, formatCode } from '../../core/groups.ts';
import { BASEPATH, appRootUrl } from '../../core/paths.ts';
import { useAction } from '../groups/index.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Your Circle: the people you can share with (everyone from your groups, and anyone you added with a code).
export function CircleScreen() {
  const app = useApp();
  const act = useAction();
  const [people, setPeople] = useState<CircleMember[] | null>(null);
  const [problem, setProblem] = useState('');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState(() => (app.circleCode ? formatCode(app.circleCode) : ''));

  const load = useCallback(async () => {
    try {
      setPeople(sortCircle(await app.circle()));
      setProblem('');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setProblem(m === 'No connection' ? tr('You are offline. The Circle needs a connection.') : tr('The Circle is not available yet: {0}', m));
    }
  }, [app]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (app.circleCode) setTyped(formatCode(app.circleCode)); }, [app.circleCode]);

  async function copy(text: string, what: string) {
    app.toast((await copyText(text)) ? tr('{0} copied.', what) : tr('Could not copy. Select it and copy it by hand.'));
  }

  if (!app.syncEnabled) return <div className={ui.card('notice')}><p><strong>{tr('The Circle needs cloud sync.')}</strong>{' '}{tr('It is not set up in this build.')}</p></div>;
  if (app.sync.mode === 'signedout' || !app.me) return <div className={ui.card('notice')}><p><strong>{tr('Sign in first.')}</strong>{' '}{tr('Your Circle lives in your cloud account, so it needs you to be signed in.')}</p></div>;

  return (
    <section aria-label={tr('Your Circle')} className="[&>*+*]:mt-4">
      <p className="text-muted text-[13px]">{tr('Your Circle is everyone you share with: the people in your groups are in it automatically, and you can add anyone else with a code. They see only your name.')}</p>
      {problem && <p className={ui.msg('bad')} role="alert">{problem}</p>}
      <div className={ui.card()}>
        <h3>{tr('Add someone')}</h3>
        {code ? (
          <>
            <p className={ui.codeBox} aria-label={tr('Circle code')}>{formatCode(code)}</p>
            <p className="text-muted text-[13px]">{tr('Works once, for 7 days. Send it only to the person you mean to add.')}</p>
            <div className={ui.btnRow}>
              <button type="button" className={ui.btn()} onClick={() => { void copy(circleLink(appRootUrl(window.location.href, BASEPATH), code), 'Link'); }}>{tr('Copy link')}</button>
              <button type="button" className={ui.btn('ghost')} onClick={() => { void copy(formatCode(code), 'Code'); }}>{tr('Copy code')}</button>
            </div>
          </>
        ) : null}
        <button type="button" className={ui.btn(code ? 'ghost' : 'solid', 'md', ui.inCard)} disabled={act.busy} onClick={() => { void act.run(async () => { setCode(await app.newCircleCode()); }); }}>{code ? tr('Make another code') : tr('Make a code')}</button>
        {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      </div>
      <form className={ui.card()} noValidate onSubmit={(ev) => {
        ev.preventDefault();
        void act.run(async () => {
          const name = await app.joinCircle(typed);
          app.toast(name ? tr('{0} is in your Circle.', name) : tr('Added to your Circle.'));
          setTyped('');
          await load();
        });
      }}>
        <h3>{tr('Use a code')}</h3>
        <label className={ui.field}><span>{tr('Their code')}</span><input value={typed} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></label>
        <button type="submit" className={ui.btn()} disabled={act.busy || !codeLooksValid(typed)}>{tr('Add to my Circle')}</button>
      </form>
      <h3 className="text-[16px] mt-5 mb-2">{tr('People')}</h3>
      {people === null && !problem && <p className="text-muted">{tr('Loading…')}</p>}
      {people?.length === 0 && <p className="text-muted">{tr('Nobody yet. Join a group, or share a code.')}</p>}
      {people && people.length > 0 && (
        <ul className={ui.list(true)}>
          {people.map((m) => (
            <li key={m.user_id} className={ui.dueRow()}>
              <span className={ui.rowMain(true)}><b>{circleName(m)}</b><small>{circleHow(m)}</small></span>
              {m.linked && (
                <button type="button" className={ui.btn('ghost', 'small')} disabled={act.busy} onClick={() => {
                  if (window.confirm(tr('Take {0} out of your Circle? They lose you too. People you share a group with stay listed through that group.', circleName(m)))) void act.run(() => app.removeFromCircle(m.user_id), 'Removed').then(load);
                }}>{tr('Remove')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
