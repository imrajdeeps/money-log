import { useApp } from '../../data/context.tsx';
import { copyText } from '../../ui/files.ts';
import { shortDate } from '../../core/format.ts';
import { formatCode, inviteLink } from '../../core/groups.ts';
import type { Group, Member } from '../../core/groups.ts';
import { hasRoom, kindLabel, kindMax } from '../../core/groupKinds.ts';
import { BASEPATH, appRootUrl } from '../../core/paths.ts';
import { useAction } from './useAction.ts';
import { WhatsAppButton } from '../../ui/WhatsAppButton.tsx';
import * as ui from '../../ui/styles.ts';
import * as st from './settingsStyles.ts';
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
  const link = live ? inviteLink(appRootUrl(window.location.href, BASEPATH), live.code) : '';
  return (
    <section className={st.section}>
      <h3 className={st.title}>{tr('Invite people')}</h3>
      {closed && <p className={st.note}>{tr('This trip is closed, so nobody can join it. Reopen it to invite someone.')}</p>}
      {!closed && !room && <p className={st.note}>{tr('A {0} group holds at most {1} people and this one is full. If someone leaves, a new code can be made here.', kindLabel(group.kind).toLowerCase(), kindMax(group.kind))}</p>}
      {!closed && room && live && (
        <>
          <p className={st.note}>{tr("Anyone with this code can join and will see the group's expenses.")} {tr('It works until {0}.', shortDate(live.expires_at.slice(0, 10)))}</p>
          <p className="m-0 text-[24px] font-[750] tracking-[0.08em] text-center p-3 border border-dashed border-control-line rounded-xl tabular-nums select-all" aria-label={tr('Join code')}>{formatCode(live.code)}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ui.btn('outline', 'none', st.outline44)} onClick={() => { void copy(link, 'Link'); }}>{tr('Copy link')}</button>
            <button type="button" className={ui.btn('outline', 'none', st.outline44)} onClick={() => { void copy(formatCode(live.code), 'Code'); }}>{tr('Copy code')}</button>
          </div>
          <WhatsAppButton tone="solid" text={tr('Join "{0}" on Hisaab: {1} (code {2})', group.name, link, formatCode(live.code))} />
        </>
      )}
      {!closed && room && !live && <p className={st.note}>{tr('The code has expired. Make a new one to invite someone.')}</p>}
      {!closed && room && <button type="button" className="self-start min-h-11 p-0 border-0 bg-transparent text-brand text-[14px] font-semibold underline cursor-pointer [font-family:inherit] disabled:opacity-50" disabled={act.busy} onClick={() => { if (window.confirm('Make a new code? The old one stops working.')) void act.run(() => app.resetInvite(group.id), 'New code made'); }}>{live ? tr('Make a new code (the old one stops working)') : tr('Make a new code')}</button>}
      {act.error && <p className={ui.msg('bad')} role="alert">{act.error}</p>}
    </section>
  );
}
