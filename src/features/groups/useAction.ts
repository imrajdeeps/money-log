import { useState } from 'react';
import { useApp } from '../../data/context.tsx';

const NAME_KEY = 'money-log.name';

export const rememberedName = (): string => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };

export const rememberName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* a convenience only */ } };

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
      setError(m === 'No connection' ? 'You are offline. Creating, joining and leaving groups needs a connection.' : m);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
