import { useApp } from '../../data/context.tsx';
import { NOTICE_KINDS } from '../../core/noticeKinds.ts';
import type { NoticeKind } from '../../core/noticeKinds.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// What each kind is, in a few words and with an example (the texts are written out so they can be translated).
function describe(kind: NoticeKind): { name: string; example: string } {
  switch (kind) {
    case 'due': return { name: tr('Due items'), example: tr('Renew passport is due in 2 days') };
    case 'recurring': return { name: tr('Recurring payments'), example: tr('Rent is waiting to be logged') };
    case 'budget': return { name: tr('Budgets'), example: tr('Eating out has used 85% of its budget') };
    case 'goal': return { name: tr('Goals'), example: tr('Laptop is behind') };
    case 'group': return { name: tr('Group balances'), example: tr('Trip: you are owed ₹1,200') };
    case 'networth': return { name: tr('Net worth reminder'), example: tr('Update your net worth, after 30 days') };
    case 'backup': return { name: tr('Backup reminder'), example: tr('Download a backup, after 30 days') };
    case 'sync': return { name: tr('Sync problems'), example: tr('Changes are not reaching the cloud') };
    default: return { name: tr('Sign-ins on other devices'), example: tr('Signed in on another device') };
  }
}

// Settings, Notifications: one switch per kind, and a way to bring dismissed notifications back. Both sync with the rest of the data.
export function NotificationsCard() {
  const app = useApp();
  return (
    <div className={ui.card()}>
      <h2>{tr('Notifications')}</h2>
      <p className="text-muted text-[13px]">{tr('The bell at the top shows what needs you, worked out on this phone from your own data. Choose what to be told about. Your choices, and what you dismiss, follow you to your other phones.')}</p>
      <ul className={ui.list(true, 'mt-2')}>
        {NOTICE_KINDS.map((kind) => {
          const d = describe(kind);
          return (
            <li key={kind} className="py-1">
              <label className={ui.check}>
                <input type="checkbox" checked={app.noticeKinds.has(kind)} onChange={(e) => { void app.setNoticeKind(kind, e.target.checked); }} />
                <span className="text-left"><b className="block">{d.name}</b><small className="text-muted">{d.example}</small></span>
              </label>
            </li>
          );
        })}
      </ul>
      <button type="button" className={ui.btn('ghost', 'md', ui.inCard)} onClick={() => { void app.showDismissed().then(() => app.toast(tr('Dismissed notifications are back.'))); }}>{tr('Show dismissed notifications again')}</button>
    </div>
  );
}
