import { useApp } from '../data/context.tsx';
import { clockLabel } from '../core/format.ts';
import { pill } from './styles.ts';
import type { PillTone } from './styles.ts';
import { tr } from '../core/i18n.ts';

export function SyncPill({ onOpenSettings }: Readonly<{ onOpenSettings: () => void }>) {
  const app = useApp();
  const s = app.sync;
  let label = '';
  let cls: PillTone = 'idle';
  let action = app.syncNow;
  switch (s.mode) {
    case 'local': label = tr('This phone only'); cls = 'muted'; action = onOpenSettings; break;
    case 'signedout': label = tr('Sign in to sync'); cls = 'warn'; action = onOpenSettings; break;
    case 'syncing': label = 'Syncing…'; cls = 'busy'; break;
    case 'offline': label = s.pending ? tr('Offline · {0} waiting', s.pending) : tr('Offline'); cls = 'warn'; break;
    case 'error': label = tr('Sync error · tap to retry'); cls = 'bad'; break;
    default:
      label = s.pending ? tr('{0} waiting', s.pending) : s.lastSync ? tr('Synced {0}', clockLabel(s.lastSync)) : tr('Synced');
      cls = s.pending ? 'warn' : 'good';
  }
  return (
    <button type="button" className={pill(cls)} onClick={action} title={s.error ?? undefined} aria-live="polite">
      {label}
    </button>
  );
}
