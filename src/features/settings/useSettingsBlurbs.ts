import { useApp } from '../../data/context.tsx';
import { useLastBackup } from '../../data/useLastBackup.ts';
import { soundsOn } from '../../data/phonePrefs.ts';
import { activeRecurring, recurringThisMonth } from '../../core/recurring.ts';
import { clockLabel, shortDate } from '../../core/format.ts';
import { isoDate } from '../../core/logic.ts';
import { LANGS, getLang, tr } from '../../core/i18n.ts';
import { SETTINGS_SECTIONS } from './settingsSections.ts';
import type { SettingsSection } from './settingsSections.ts';
import { useTheme } from './theme.ts';
import { VERSION } from './parts/shared.ts';
import { FEATURES } from '../../core/featureKinds.ts';
import { FEATURE_NAMES } from './featureNames.ts';

const THEME_WORDS = { system: 'Match my device', light: 'Light', dark: 'Dark' } as const;

// "Plan, Net worth off" or "Everything on": the parts that are hidden now (Settings, Features).
function featuresBlurb(on: ReadonlySet<string>): string {
  const off = FEATURES.filter((f) => !on.has(f)).map((f) => tr(FEATURE_NAMES[f]));
  return off.length > 0 ? tr('{0} off', off.join(', ')) : tr('Everything on');
}

// The line under each part of the Settings list, as on the design: what it is set to now, in a few words.
export function useSettingsBlurbs(): Record<SettingsSection, string> {
  const app = useApp();
  const lastBackup = useLastBackup();
  const sounds = soundsOn.use();
  const { choice } = useTheme();
  const today = isoDate();
  const s = app.sync;
  const signedIn = app.syncEnabled && s.mode !== 'signedout' && s.mode !== 'local';
  const set = activeRecurring(app.recurring).length;
  const due = recurringThisMonth(app.recurring, today).filter((r) => r.state === 'due').length;
  const lang = LANGS.find((l) => l.id === getLang())?.native ?? 'English';
  const base = Object.fromEntries(SETTINGS_SECTIONS.map((x) => [x.id, tr(x.blurb)])) as Record<SettingsSection, string>;
  return {
    ...base,
    account: signedIn ? [s.lastSync ? tr('Synced {0}', clockLabel(s.lastSync)) : '', s.email ?? ''].filter(Boolean).join(' · ') : app.syncEnabled ? tr('Not signed in') : tr('This device only'),
    recurring: set > 0 ? tr('{0} set up · {1} due this month', set, due) : base.recurring,
    backup: lastBackup ? tr('Last backup {0}', shortDate(isoDate(new Date(lastBackup)))) : tr('No backup on this device yet'),
    lock: app.lock ? tr('PIN on') : tr('Off'),
    appearance: [tr(THEME_WORDS[choice]), sounds ? tr('sounds on') : tr('sounds off'), lang].join(' · '),
    notifications: tr('{0} kinds of notes on', app.noticeKinds.size),
    features: featuresBlurb(app.features),
    about: tr('Version {0}, install help, the tour', VERSION),
  };
}
