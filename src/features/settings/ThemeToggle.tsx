import { Icon } from '../../ui/Icon.tsx';
import { useTheme } from './theme.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The quick switch in the header: the opposite of what is showing now. "Match my phone" lives in Settings, Appearance.
export function ThemeToggle() {
  const { theme, set } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={ui.iconBtn} aria-label={tr('Switch to {0} mode', next)} onClick={() => set(next)}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
