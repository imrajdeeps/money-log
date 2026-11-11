import { Icon } from '../../ui/Icon.tsx';
import { useApp } from '../../data/context.tsx';
import { NOTICE_KINDS } from '../../core/noticeKinds.ts';
import type { Notice, OpenTarget, Tone } from '../../core/notifications.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';
import { useNotices } from './useNotices.ts';

const MARK: Record<Tone, string> = { attention: 'bg-bad', soon: 'bg-warn', reminder: 'bg-muted' };

function Row({ notice, onOpen, onDismiss }: Readonly<{ notice: Notice; onOpen: () => void; onDismiss: () => void }>) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <i className={`h-2.5 w-2.5 flex-none rounded-full ${MARK[notice.tone]}`} aria-hidden="true" />
      <button type="button" className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit [font:inherit]" onClick={onOpen} aria-label={tr('Open: {0}', notice.title)}>
        <b className="block [overflow-wrap:anywhere]">{notice.title}</b>
        <small className="text-muted">{notice.detail}</small>
      </button>
      <button type="button" className={ui.icoBtn} aria-label={tr('Dismiss: {0}', notice.title)} onClick={onDismiss}><Icon name="close" size={18} /></button>
    </li>
  );
}

// Everything that needs attention now: needs attention first, then what is coming up, then reminders. Tap one to open the right screen;
// the cross hides it for good (on every phone), until the situation changes.
export function NotificationsScreen({ onOpen, onSettings }: Readonly<{ onOpen: (t: OpenTarget) => void; onSettings: () => void }>) {
  const app = useApp();
  const notices = useNotices();
  const off = NOTICE_KINDS.length - app.noticeKinds.size;
  const group = (tone: Tone, title: string) => {
    const list = notices.filter((n) => n.tone === tone);
    if (list.length === 0) return null;
    return (
      <>
        <h3 className="mb-2 mt-5 text-[16px]">{title}</h3>
        <ul className={ui.list()}>
          {list.map((n) => <Row key={n.key} notice={n} onOpen={() => onOpen(n.open)} onDismiss={() => { void app.dismissNotice(n.key); }} />)}
        </ul>
      </>
    );
  };
  return (
    <section aria-label={tr('Notifications')}>
      {notices.length === 0 && <p className="text-muted">{tr('Nothing needs you right now.')}</p>}
      {group('attention', tr('Needs attention'))}
      {group('soon', tr('Coming up'))}
      {group('reminder', tr('Reminders'))}
      <p className="mt-5 text-[13px] text-muted">{off > 0 ? tr('{0} kind{1} of notification {2} switched off.', off, off === 1 ? '' : 's', off === 1 ? 'is' : 'are') : tr('Every kind of notification is on.')}</p>
      <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} onClick={onSettings}>{tr('Choose what to be told about')}</button>
    </section>
  );
}
