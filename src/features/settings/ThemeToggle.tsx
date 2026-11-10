import { Icon } from '../../ui/Icon.tsx';
import { useTheme } from './theme.ts';
import * as ui from '../../ui/styles.ts';

// The quick switch in the header: the opposite of what is showing now. "Match my phone" lives in Settings, Appearance.
export function ThemeToggle() {
  const { theme, set } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={ui.iconBtn} aria-label={`Switch to ${next} mode`} onClick={() => set(next)}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
