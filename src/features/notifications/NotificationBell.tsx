import { Icon } from '../../ui/Icon.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';
import { useNotices } from './useNotices.ts';

// The bell in the top bar: how many notifications there are now (nothing drawn when there are none, 9+ above nine). It opens the
// notification page.
export function NotificationBell({ onOpen, current }: Readonly<{ onOpen: () => void; current: boolean }>) {
  const count = useNotices().length;
  return (
    <button type="button" data-tour="notifications" className={`${ui.iconBtn} relative`} aria-label={count > 0 ? tr('Notifications ({0})', count) : tr('Notifications')} aria-current={current ? 'page' : undefined} onClick={onOpen}>
      <Icon name="bell" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold leading-none text-bad-ink" aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
