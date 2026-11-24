import { Component } from 'react';
import type { ReactNode } from 'react';
import { recordCrash } from '../data/crashes.ts';
import { CrashScreen } from './CrashScreen.tsx';

interface State { failed: boolean }

// The last safety net, for what the router's own page boundary does not catch (the app shell, a provider): the crash screen instead of a blank page.
export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: unknown): void {
    recordCrash(error, 'screen');
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
