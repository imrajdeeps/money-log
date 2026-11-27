import { useApp } from '../../data/context.tsx';
import { NOTICE_KINDS } from '../../core/noticeKinds.ts';
import { noticeKindsShown } from '../../core/features.ts';
import type { NoticeKind } from '../../core/noticeKinds.ts';
import { DailyReminder } from './DailyReminder.tsx';
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

// Notifications: one switch per kind, and a way to bring dismissed notifications back. Both sync with the rest of the data.
export function NotificationsCard() {
  const app = useApp();
  const offered = noticeKindsShown(new Set(NOTICE_KINDS), app.features); // a part that is turned off has no switch here
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Which notes appear')}</h3>
        <ul className="list-none m-0 px-4 bg-card border border-line rounded-card [&>li+li]:border-t [&>li+li]:border-line">
          {NOTICE_KINDS.filter((kind) => offered.has(kind)).map((kind) => {
            const d = describe(kind);
            return (
              <li key={kind}>
                <label className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[62px] py-2 cursor-pointer">
                  <span className="flex flex-col"><span className="text-[15px] font-semibold">{d.name}</span><span className="text-[13px] text-muted">{d.example}</span></span>
                  <input type="checkbox" role="switch" className={ui.switchBox} aria-label={d.name} checked={app.noticeKinds.has(kind)} onChange={(e) => { void app.setNoticeKind(kind, e.target.checked); }} />
                </label>
              </li>
            );
          })}
        </ul>
        <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('Notes are made on this device from your own data. Nothing is sent to you by email or push. Your choices, and what you dismiss, follow you to your other devices.')}</p>
      </section>
      <button type="button" className={ui.btn('outline', 'none', 'min-h-12 text-[15px]')} onClick={() => { void app.showDismissed().then(() => app.toast(tr('Dismissed notifications are back.'))); }}>{tr('Show dismissed notifications again')}</button>
      <DailyReminder />
    </>
  );
}
