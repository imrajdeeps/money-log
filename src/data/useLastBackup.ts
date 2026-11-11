import { useSyncExternalStore } from 'react';
import { loadLastBackup, subscribeLastBackup } from './backupSeen.ts';

// When a backup was last downloaded here (null: never), kept up to date wherever it is used.
export const useLastBackup = (): number | null => useSyncExternalStore(subscribeLastBackup, loadLastBackup);
