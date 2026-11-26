import { useEffect, useRef } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import { playChime } from '../../ui/sound.ts';
import { chimeDue } from '../../core/sound.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';
import { useNotices } from './useNotices.ts';

// The bell in the top bar: how many notifications there are now (nothing drawn when there are none, 9+ above nine). It opens the
// notification page. A gentle chime plays when the count goes up while the app is open (not for the notes there when it opens, at
// most once a minute, off in Settings).
export function NotificationBell({ onOpen, current }: Readonly<{ onOpen: () => void; current: boolean }>) {
  const count = useNotices().length;
  const prev = useRef<number | null>(null);
  const lastChime = useRef(0);
  const opened = useRef(Date.now());
  useEffect(() => {
    const now = Date.now();
    const settled = prev.current !== null && now - opened.current > 5000; // the notes worked out at start-up do not ring
    if (settled && chimeDue(prev.current ?? count, count, lastChime.current, now)) { lastChime.current = now; playChime(); }
    prev.current = count;
  }, [count]);
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
