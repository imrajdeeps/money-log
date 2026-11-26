import { useCallback, useEffect, useState } from 'react';
import { ask } from '../../ui/confirm.tsx';
import { useApp } from '../../data/context.tsx';
import { copyText } from '../../ui/files.ts';
import { circleCodeLooksValid, circleHow, circleLink, circleName, sortCircle } from '../../core/circle.ts';
import type { CircleMember } from '../../core/circle.ts';
import { formatCode } from '../../core/groups.ts';
import { BASEPATH, appRootUrl } from '../../core/paths.ts';
import { useAction } from '../groups/index.ts';
import { WhatsAppButton } from '../../ui/WhatsAppButton.tsx';
import { personLetters } from '../../core/profile.ts';
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

  const link = code ? circleLink(appRootUrl(window.location.href, BASEPATH), code) : '';
  return (
    <section aria-label={tr('Your Circle')} className="flex flex-col gap-4 lg:max-w-[640px]">
      {problem && <p className={ui.msg('bad')} role="alert">{problem}</p>}
      {people === null && !problem && <p className="m-0 text-muted">{tr('Loading…')}</p>}
      {people?.length === 0 && <p className="m-0 text-muted">{tr('Nobody yet. Join a group, or share a code.')}</p>}
      {people && people.length > 0 && (
        <ul className="list-none m-0 pl-4 pr-2 bg-card border border-line rounded-card">
          {people.map((m, i) => (
            <li key={m.user_id} className={ui.cx('grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center min-h-16', i > 0 && 'border-t border-line')}>
              <span className={ui.cx('w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold', AVATAR[i % AVATAR.length])} aria-hidden="true">{personLetters(circleName(m))}</span>
              <span className="flex flex-col min-w-0"><span className="text-[16px] font-semibold truncate">{circleName(m)}</span><span className="text-[13px] text-muted truncate">{circleHow(m)}</span></span>
              {m.linked ? (
                <button type="button" className="min-h-11 px-3 border-0 rounded-[10px] bg-transparent text-bad text-[14px] font-[650] cursor-pointer [font-family:inherit] enabled:active:bg-bad-bg disabled:opacity-50" disabled={act.busy} onClick={() => {
                  void ask(tr('Take {0} out of your Circle? They lose you too. People you share a group with stay listed through that group.', circleName(m)), tr('Take out')).then((yes) => { if (yes) void act.run(() => app.removeFromCircle(m.user_id), 'Removed').then(load); });
                }}>{tr('Remove')}</button>
              ) : <span />}
            </li>
          ))}
        </ul>
      )}
      <form className="bg-card border border-line rounded-card p-4 flex flex-col gap-2.5" noValidate onSubmit={(ev) => {
        ev.preventDefault();
        void act.run(async () => {
          const name = await app.joinCircle(typed);
          app.toast(name ? tr('{0} is in your Circle.', name) : tr('Added to your Circle.'));
          setTyped('');
          await load();
        });
      }}>
        <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Add someone')}</h3>
        <p className="m-0 text-[14px] leading-5 text-muted">{tr('Send them your Circle code, or type theirs.')}{code ? ` ${tr('Works once, for 7 days.')}` : ''}</p>
        {code ? (
          <>
            <p className="m-0 text-[24px] font-[750] tracking-[0.08em] text-center p-3 border border-dashed border-control-line rounded-xl tabular-nums select-all [overflow-wrap:anywhere]" aria-label={tr('Circle code')}>{formatCode(code)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={ui.btn('outline', 'none', 'min-h-11 px-3 text-[15px]')} onClick={() => { void copy(link, 'Link'); }}>{tr('Copy code')}</button>
              <WhatsAppButton size="row" label={tr('Share on WhatsApp')} text={tr('Add me to your Circle on Hisaab: {0} (code {1})', link, formatCode(code))} />
            </div>
          </>
        ) : (
          <button type="button" className="min-h-[72px] border border-dashed border-control-line rounded-xl bg-transparent text-brand text-[16px] font-[650] cursor-pointer [font-family:inherit] disabled:opacity-50" disabled={act.busy} onClick={() => { void act.run(async () => { setCode(await app.newCircleCode()); }); }}>{tr('Make my Circle code')}</button>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 pt-1">
          <input className="min-h-12" value={typed} placeholder={tr('Their code')} aria-label={tr('Their Circle code')} autoCapitalize="characters" autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" className={ui.btn('solid', 'none', 'min-h-12 px-[18px] text-[15px]')} disabled={act.busy || !circleCodeLooksValid(typed)}>{tr('Add')}</button>
        </div>
        {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
      </form>
    </section>
  );
}

// The round pictures' colours, in turn (as the design's Circle list).
const AVATAR = ['bg-good-bg text-good', 'bg-warn-bg text-warn', 'bg-tint-blue text-tint-blue-ink', 'bg-press text-ink', 'bg-[#104A30] text-[#C9E96A]'];
