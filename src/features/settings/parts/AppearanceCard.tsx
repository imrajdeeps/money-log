import { useTheme } from '../theme.ts';
import type { ThemeChoice } from '../theme.ts';

const LOOKS: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Match my phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function AppearanceCard() {
  const { choice, theme, set } = useTheme();
  return (
    <div className="card">
      <h2>Appearance</h2>
      <div className="chips" role="group" aria-label="Light or dark">
        {LOOKS.map((l) => (
          <button key={l.id} type="button" className="chip" aria-pressed={choice === l.id} onClick={() => set(l.id)}>{l.label}</button>
        ))}
      </div>
      <p className="muted small">
        {choice === 'system' ? `It follows your phone's setting, and is ${theme} now.` : `Always ${choice} on this phone, whatever the phone's own setting is.`}
        {' '}The sun or moon button at the top switches between light and dark any time.
      </p>
    </div>
  );
}
