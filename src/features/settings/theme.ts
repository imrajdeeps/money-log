// Light, dark, or "match my phone". The choice is kept on this phone only (localStorage) and shown on <html data-theme>,
// always as the resolved value ("light" or "dark"), which styles.css reads. public/theme-init.js does the same resolution
// before the first paint so a dark phone never flashes white; tests/theme.test.ts keeps the two in step.
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'money-log.theme';
// The page colour in each theme, for the browser's own bars (the <meta name="theme-color">). Same values as --bg in styles.css.
export const THEME_BG: Record<Theme, string> = { light: '#f5f6f3', dark: '#0c110e' };

export function cleanChoice(v: unknown): ThemeChoice {
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

// ---------------------------------------------------------------- the browser side
interface State { choice: ThemeChoice; theme: Theme }

const query = (): MediaQueryList | null => {
  try { return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null; } catch { return null; }
};

function readChoice(): ThemeChoice {
  try { return cleanChoice(localStorage.getItem(THEME_KEY)); } catch { return 'system'; }
}

const compute = (choice: ThemeChoice): State => ({ choice, theme: resolveTheme(choice, Boolean(query()?.matches)) });

let state: State = compute(readChoice());
const listeners = new Set<() => void>();

function paint(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[state.theme]);
}

function update(choice: ThemeChoice): void {
  const next = compute(choice);
  if (next.choice === state.choice && next.theme === state.theme) return;
  state = next;
  paint();
  listeners.forEach((l) => l());
}

export function setThemeChoice(choice: ThemeChoice): void {
  try { if (choice === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, choice); } catch { /* the choice then lasts until the page closes */ }
  update(choice);
}

// Called once at start: paint what is stored, and follow the phone while the choice is "match my phone".
export function startTheme(): void {
  update(readChoice());
  paint();
  query()?.addEventListener?.('change', () => { if (state.choice === 'system') update('system'); });
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => state;

export function useTheme(): State & { set: (c: ThemeChoice) => void } {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...s, set: setThemeChoice };
}
