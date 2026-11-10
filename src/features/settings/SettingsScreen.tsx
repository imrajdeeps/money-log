import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import { RecurringCard } from '../recurring/index.ts';
import { useApp } from '../../data/context.tsx';
import { SETTINGS_SECTIONS } from './settingsSections.ts';
import type { SettingsSection } from './settingsSections.ts';
import { BackupCard } from './parts/BackupCard.tsx';
import { DangerCard } from './parts/DangerCard.tsx';
import { PlanCard } from './parts/PlanCard.tsx';
import { AppearanceCard } from './parts/AppearanceCard.tsx';
import { PasswordCard } from './parts/PasswordCard.tsx';
import { AccountCard } from './parts/AccountCard.tsx';
import { ReceiptsCard } from './parts/ReceiptsCard.tsx';
import { AboutCard } from './parts/AboutCard.tsx';
import { AppLockCard } from './parts/AppLockCard.tsx';
import * as ui from '../../ui/styles.ts';

// A list of headings; tapping one opens just that part. Every part stays mounted (only hidden), so a half-typed
// password or a half-pasted plan is still there after a look at another part.
export function SettingsScreen({ section, onSection }: { section?: SettingsSection; onSection: (s?: SettingsSection) => void }) {
  const app = useApp();
  const signedIn = app.syncEnabled && app.sync.mode !== 'signedout' && app.sync.mode !== 'local';
  const sections = SETTINGS_SECTIONS.filter((s) => s.id !== 'password' || signedIn);
  const open = sections.find((s) => s.id === section)?.id;
  const blurb = (id: SettingsSection, fallback: string) => {
    if (id !== 'account') return fallback;
    return signedIn ? `Signed in as ${app.sync.email ?? ''}` : app.syncEnabled ? 'Not signed in' : 'This phone only';
  };
  const parts: Record<SettingsSection, ReactNode> = {
    account: <AccountCard />,
    password: <PasswordCard />,
    recurring: <RecurringCard />,
    appearance: <AppearanceCard />,
    plan: <PlanCard />,
    receipts: <ReceiptsCard />,
    lock: <AppLockCard />,
    backup: <BackupCard />,
    erase: <DangerCard />,
    about: <AboutCard />,
  };
  return (
    <section aria-label="Settings">
      {open ? (
        <button type="button" className="settings-back" onClick={() => onSection(undefined)}><Icon name="chevron" size={20} />Settings</button>
      ) : (
        <div className="pagehead"><h2>Settings</h2></div>
      )}
      <ul className={ui.list()} hidden={open !== undefined}>
        {sections.map((s) => (
          <li key={s.id}>
            <button type="button" className={ui.row} onClick={() => onSection(s.id)}>
              <span className={ui.rowMain()}><b>{s.title}</b><small>{blurb(s.id, s.blurb)}</small></span>
              <Icon name="chevron" size={20} />
            </button>
          </li>
        ))}
      </ul>
      {sections.map((s) => <div key={s.id} hidden={open !== s.id}>{parts[s.id]}</div>)}
    </section>
  );
}
