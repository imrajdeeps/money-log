import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import { RecurringCard } from '../recurring/index.ts';
import { useApp } from '../../data/context.tsx';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settingsSections.ts';
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
import { ProfileCard } from './parts/ProfileCard.tsx';
import { SessionCard } from './parts/SessionCard.tsx';
import { useProfile } from '../../data/useProfile.ts';
import { formatWhatsapp } from '../../core/profile.ts';
import * as ui from '../../ui/styles.ts';

// A list of headings; tapping one opens just that part. Every part stays mounted (only hidden), so a half-typed
// password or a half-pasted plan is still there after a look at another part.
export function SettingsScreen({ section, onSection }: { section?: SettingsSection; onSection: (s?: SettingsSection) => void }) {
  const app = useApp();
  const profile = useProfile();
  const signedIn = app.syncEnabled && app.sync.mode !== 'signedout' && app.sync.mode !== 'local';
  const sections = SETTINGS_SECTIONS.filter((s) => s.id !== 'password' || signedIn);
  const open = sections.find((s) => s.id === section)?.id;
  const blurb = (id: SettingsSection, fallback: string) => {
    if (id === 'profile') return profile.name ? `${profile.name}${profile.whatsapp ? ` · ${formatWhatsapp(profile.whatsapp)}` : ''}` : fallback;
    if (id !== 'account') return fallback;
    return signedIn ? `Signed in as ${app.sync.email ?? ''}` : app.syncEnabled ? 'Not signed in' : 'This phone only';
  };
  const parts: Record<SettingsSection, ReactNode> = {
    profile: <ProfileCard />,
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
        <button type="button" className={ui.backLink} onClick={() => onSection(undefined)}><Icon name="chevron" size={20} />Settings</button>
      ) : (
        <div className={ui.pageHead}><h2>Settings</h2></div>
      )}
      <div hidden={open !== undefined}>
        {signedIn && <SessionCard onSwitched={() => onSection('account')} />}
        {SETTINGS_GROUPS.map((g, gi) => {
          const items = sections.filter((s) => s.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <h3 className={`text-[13px] font-semibold text-muted mx-0 mb-1.5 ${gi === 0 && !signedIn ? 'mt-0' : 'mt-5'}`}>{g}</h3>
              <ul className={ui.list()}>
                {items.map((s) => (
                  <li key={s.id}>
                    <button type="button" data-tour={s.id === 'profile' ? 'settings-profile' : undefined} className={ui.row} onClick={() => onSection(s.id)}>
                      <span className={ui.rowMain()}><b>{s.title}</b><small>{blurb(s.id, s.blurb)}</small></span>
                      <Icon name="chevron" size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {sections.map((s) => <div key={s.id} hidden={open !== s.id}>{parts[s.id]}</div>)}
    </section>
  );
}
