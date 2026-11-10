import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { loadProfile, saveProfile } from '../../data/profile.ts';
import { tr } from '../../core/i18n.ts';

// "Your name in this group" starts from the name in the profile, and what is typed there is kept in the profile.
export const rememberedName = (): string => loadProfile().name;

export const rememberName = (n: string) => saveProfile({ ...loadProfile(), name: n });

// Runs a group action, keeping the button busy and showing the server's own message when it refuses.
export function useAction() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (done) app.toast(done);
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m === 'No connection' ? tr('You are offline. Creating, joining and leaving groups needs a connection.') : m);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
