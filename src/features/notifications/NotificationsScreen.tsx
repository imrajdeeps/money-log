import { useApp } from '../../data/context.tsx';
import type { Notice, OpenTarget, Tone } from '../../core/notifications.ts';
import type { NoticeKind } from '../../core/noticeKinds.ts';
import { tr } from '../../core/i18n.ts';
import { useNotices } from './useNotices.ts';
import { NotificationsCard } from './NotificationsCard.tsx';

const MARK: Record<Tone, string> = { attention: 'bg-bad', soon: 'bg-warn', reminder: 'bg-muted' };
const ORDER: Record<Tone, number> = { attention: 0, soon: 1, reminder: 2 };

// The words on a note's main button: where it takes you, said as what you will do there.
function actionLabel(kind: NoticeKind): string {
  switch (kind) {
    case 'due': return tr('Open Due soon');
    case 'recurring': return tr('Log it');
    case 'budget': return tr('See Month');
    case 'goal': return tr('See goal');
    case 'group': return tr('See group');
    case 'networth': return tr('Check in');
    case 'backup': return tr('Download backup');
    case 'sync': return tr('Open Cloud sync');
    default: return tr('See sign-ins');
  }
}

// One note, as on the design: a coloured dot (red needs you, amber soon, grey a reminder), what it is, and its buttons.
function NoteCard({ notice, onOpen, onDismiss }: Readonly<{ notice: Notice; onOpen: () => void; onDismiss: () => void }>) {
  return (
    <li className="bg-card border border-line rounded-card px-4 py-3.5 grid grid-cols-[10px_minmax(0,1fr)] gap-3">
      <span className={`w-2.5 h-2.5 mt-1.5 rounded-full ${MARK[notice.tone]}`} aria-hidden="true" />
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-[15px] font-[650] [overflow-wrap:anywhere]">{notice.title}</span>
        <span className="text-[14px] leading-5 text-muted">{notice.detail}</span>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="min-h-10 px-3.5 rounded-[10px] border-0 bg-primary text-primary-ink text-[14px] font-[650] cursor-pointer [font-family:inherit] active:bg-primary-press" onClick={onOpen}>{actionLabel(notice.kind)}</button>
          <button type="button" className="min-h-10 px-3 rounded-[10px] border-0 bg-transparent text-muted text-[14px] font-semibold cursor-pointer [font-family:inherit] active:bg-press" aria-label={tr('Dismiss: {0}', notice.title)} onClick={onDismiss}>{tr('Dismiss')}</button>
        </div>
      </div>
    </li>
  );
}

// Notifications, as on the design: the notes that need you (red first, then amber, then grey), each with a button that takes you
// there and Dismiss (hidden for good, on every phone, until the situation changes); then which kinds of notes appear.
export function NotificationsScreen({ onOpen }: Readonly<{ onOpen: (t: OpenTarget) => void }>) {
  const app = useApp();
  const notices = [...useNotices()].sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  return (
    <section aria-label={tr('Notifications')} className="flex flex-col gap-4">
      {notices.length === 0 ? <p className="m-0 text-[15px] text-muted">{tr('Nothing needs you right now.')}</p> : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
          {notices.map((n) => <NoteCard key={n.key} notice={n} onOpen={() => onOpen(n.open)} onDismiss={() => { void app.dismissNotice(n.key); }} />)}
        </ul>
      )}
      <NotificationsCard />
    </section>
  );
}
