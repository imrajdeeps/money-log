import { useApp } from '../context.tsx';
import { clockLabel } from '../format.ts';

export function SyncPill({ onOpenSettings }: { onOpenSettings: () => void }) {
  const app = useApp();
  const s = app.sync;
  let label = '';
  let cls = 'idle';
  let action = app.syncNow;
  switch (s.mode) {
    case 'local': label = 'This phone only'; cls = 'muted'; action = onOpenSettings; break;
    case 'signedout': label = 'Sign in to sync'; cls = 'warn'; action = onOpenSettings; break;
    case 'syncing': label = 'Syncing…'; cls = 'busy'; break;
    case 'offline': label = s.pending ? `Offline · ${s.pending} waiting` : 'Offline'; cls = 'warn'; break;
    case 'error': label = 'Sync error · tap to retry'; cls = 'bad'; break;
    default:
      label = s.pending ? `${s.pending} waiting` : s.lastSync ? `Synced ${clockLabel(s.lastSync)}` : 'Synced';
      cls = s.pending ? 'warn' : 'good';
  }
  return (
    <button type="button" className={`pill ${cls}`} onClick={action} title={s.error ?? undefined} aria-live="polite">
      {label}
    </button>
  );
}
