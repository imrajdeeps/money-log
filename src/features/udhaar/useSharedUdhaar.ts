import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import type { CircleMember } from '../../core/circle.ts';
import type { SharedUdhaar } from '../../core/sharedUdhaar.ts';
import { tr } from '../../core/i18n.ts';

export interface SharedUdhaarState { available: boolean; shared: SharedUdhaar[]; circle: CircleMember[]; problem: string; reload: () => Promise<void> }

// Why the shared entries could not be read, in words (offline, or the database has no 2.0 yet).
function loadProblem(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m === 'No connection' ? tr('You are offline. Entries shared with your Circle show when you are back online.') : tr('Shared entries are not available yet: {0}', m);
}

// What the server holds for Udhaar (version 2.0): the entries shared with your Circle and your Circle itself (to pick people from).
// Signed out, there is nothing to read: every entry is private then.
export function useSharedUdhaar(): SharedUdhaarState {
  const app = useApp();
  const available = app.syncEnabled && app.sync.mode !== 'signedout' && !!app.me;
  const [shared, setShared] = useState<SharedUdhaar[]>([]);
  const [circle, setCircle] = useState<CircleMember[]>([]);
  const [problem, setProblem] = useState('');
  const reload = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([app.sharedUdhaar.load(), app.circle().catch(() => [] as CircleMember[])]);
      setShared(s);
      setCircle(c);
      setProblem('');
    } catch (e) {
      setProblem(loadProblem(e));
    }
  }, [app]);
  useEffect(() => { if (available) void reload(); }, [available, reload]);
  return { available, shared, circle, problem, reload };
}
