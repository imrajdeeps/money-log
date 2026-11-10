import { useTheme } from '../theme.ts';
import type { ThemeChoice } from '../theme.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

const LOOKS: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Match my phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function AppearanceCard() {
  const { choice, theme, set } = useTheme();
  return (
    <div className={ui.card()}>
      <h2>{tr('Appearance')}</h2>
      <div className={ui.chips} role="group" aria-label={tr('Light or dark')}>
        {LOOKS.map((l) => (
          <button key={l.id} type="button" className={ui.chip} aria-pressed={choice === l.id} onClick={() => set(l.id)}>{tr(l.label)}</button>
        ))}
      </div>
      <p className="text-muted text-[13px]">
        {tr('{0} The sun or moon button at the top switches between light and dark any time.', choice === 'system' ? tr('It follows your phone\'s setting, and is {0} now.', tr(theme)) : tr('Always {0} on this phone, whatever the phone\'s own setting is.', tr(choice)))}
      </p>
    </div>
  );
}
