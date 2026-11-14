import { useApp } from '../../data/context.tsx';
import { copyText } from '../../ui/files.ts';
import { shortDate } from '../../core/format.ts';
import { formatCode, inviteLink } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { hasRoom, kindLabel, kindMax } from '../../core/groupKinds.ts';
import { BASEPATH, appRootUrl } from '../../core/paths.ts';
import { useAction } from './useAction.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Invite people to one group: the code, the link, and a new code. Only an admin sees it (the group's settings decide).
export function InviteCard({ group, people }: Readonly<{ group: Group; people: Member[] }>) {
  const app = useApp();
  const act = useAction();
  const closed = group.closed_at !== null; // a closed trip takes no new people
  const invite = app.invites.find((i) => i.group_id === group.id);
  const room = hasRoom(group.kind, people.length);

  async function copy(text: string, what: string) {
    app.toast((await copyText(text)) ? tr('{0} copied.', what) : tr('Could not copy. Select it and copy it by hand.'));
  }

  const live = invite && Date.parse(invite.expires_at) > Date.now() ? invite : null;
  return (
    <div className={ui.card()}>
      <h3>{tr('Invite people')}</h3>
      {closed && <p className="text-muted text-[13px]">{tr('This trip is closed, so nobody can join it. Reopen it to invite someone.')}</p>}
      {!closed && !room && <p className="text-muted text-[13px]">{tr('A {0} group holds at most {1} people and this one is full. If someone leaves, a new code can be made here.', kindLabel(group.kind).toLowerCase(), kindMax(group.kind))}</p>}
      {!closed && room && live && (
        <>
          <p className={ui.codeBox} aria-label={tr('Join code')}>{formatCode(live.code)}</p>
          <p className="text-muted text-[13px]">{tr('Valid until {0}. Anyone with the code can join, so send it only to people you mean to add.', shortDate(live.expires_at.slice(0, 10)))}</p>
          <div className={ui.btnRow}>
            <button type="button" className={ui.btn()} onClick={() => { void copy(inviteLink(appRootUrl(window.location.href, BASEPATH), live.code), 'Link'); }}>{tr('Copy link')}</button>
            <button type="button" className={ui.btn('ghost')} onClick={() => { void copy(formatCode(live.code), 'Code'); }}>{tr('Copy code')}</button>
          </div>
        </>
      )}
      {!closed && room && !live && <p className="text-muted text-[13px]">{tr('The code has expired. Make a new one to invite someone.')}</p>}
      {!closed && room && <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} disabled={act.busy} onClick={() => { if (window.confirm('Make a new code? The old one stops working.')) void act.run(() => app.resetInvite(group.id), 'New code made'); }}>{tr('Make a new code')}</button>}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </div>
  );
}
