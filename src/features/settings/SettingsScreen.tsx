import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import { RecurringCard } from '../recurring/index.ts';
import { useApp } from '../../data/context.tsx';
import { SETTINGS_SECTIONS, sectionTitle } from './settingsSections.ts';
import { useSettingsBlurbs } from './useSettingsBlurbs.ts';
import { VERSION } from './parts/shared.ts';
import type { SettingsSection } from './settingsSections.ts';
import { BackupCard } from './parts/BackupCard.tsx';
import { DangerCard } from './parts/DangerCard.tsx';
import { AppearanceCard } from './parts/AppearanceCard.tsx';
import { PasswordCard } from './parts/PasswordCard.tsx';
import { LoginHistoryCard } from './parts/LoginHistoryCard.tsx';
import { AccountCard } from './parts/AccountCard.tsx';
import { ReceiptsCard } from './parts/ReceiptsCard.tsx';
import { AboutCard } from './parts/AboutCard.tsx';
import { AppLockCard } from './parts/AppLockCard.tsx';
import { ProfileCard } from './parts/ProfileCard.tsx';
import { LanguageCard } from './parts/LanguageCard.tsx';
import { FeaturesCard } from './parts/FeaturesCard.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// One part in the list: its name, the line under it, and an arrow. On a wide screen the open part is marked.
function PartLink({ id, title, blurb, current, onOpen }: Readonly<{ id: SettingsSection; title: string; blurb: string; current: boolean; onOpen: () => void }>) {
  const tour = id === 'profile' ? 'settings-profile' : id === 'appearance' ? 'settings-language' : undefined;
  const ink = id === 'erase' ? 'text-bad' : current ? 'lg:text-brand text-ink' : 'text-ink';
  return (
    <li>
      <button type="button" data-tour={tour} aria-current={current ? 'page' : undefined} onClick={onOpen}
        className={`w-full grid grid-cols-[minmax(0,1fr)_20px] gap-2.5 items-center min-h-[78px] py-2 px-0 border-0 bg-transparent text-left cursor-pointer [font-family:inherit] ${ink}`}>
        <span className="flex flex-col gap-px min-w-0"><span className="text-[15px] font-[650]">{title}</span><span className="text-[13px] leading-[18px] text-muted">{blurb}</span></span>
        <span className="text-muted flex"><Icon name="chevron" size={18} /></span>
      </button>
    </li>
  );
}

// Settings, as on the design: one list of parts; on a phone a part opens on a page of its own (with Settings to go back), on a
// wide screen it opens beside the list (Profile when none is chosen). Every part stays mounted (only hidden), so a half-typed
// password or a half-pasted plan is still there after a look at another part.
export function SettingsScreen({ section, onSection }: Readonly<{ section?: SettingsSection; onSection: (s?: SettingsSection) => void }>) {
  const app = useApp();
  const blurbs = useSettingsBlurbs();
  const signedIn = app.syncEnabled && app.sync.mode !== 'signedout' && app.sync.mode !== 'local';
  const sections = SETTINGS_SECTIONS.filter((s) => s.id !== 'password' || signedIn);
  const open = sections.find((s) => s.id === section)?.id;
  const shown = open ?? 'profile'; // what a wide screen shows beside the list
  const parts: Record<SettingsSection, ReactNode> = {
    profile: <ProfileCard />,
    account: <AccountCard />,
    password: <><PasswordCard /><LoginHistoryCard /></>,
    recurring: <RecurringCard />,
    appearance: <><AppearanceCard /><LanguageCard /></>,
    features: <FeaturesCard />,
    notifications: null, // opens the Notifications page, where the choices sit under the notes
    receipts: <ReceiptsCard />,
    lock: <AppLockCard />,
    backup: <BackupCard />,
    erase: <DangerCard />,
    about: <AboutCard />,
  };
  return (
    <section aria-label={tr('Settings')} className="grid grid-cols-1 gap-x-7 gap-y-4 items-start lg:grid-cols-[400px_minmax(0,1fr)]">
      <div className={`flex flex-col gap-3.5 ${open ? 'max-lg:hidden' : ''}`}>
        <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Settings')}</h2>
        <nav aria-label={tr('Settings')} className="bg-card border border-line rounded-card pl-4 pr-3">
          <ul className="list-none m-0 p-0 [&>li+li]:border-t [&>li+li]:border-line">
            {sections.map((s) => <PartLink key={s.id} id={s.id} title={tr(s.title)} blurb={blurbs[s.id]} current={s.id === shown} onOpen={() => onSection(s.id)} />)}
          </ul>
        </nav>
        <p className="m-0 text-[13px] text-muted text-center">{tr('Hisaab {0} · this device holds {1} payments', VERSION, app.entries.length)}</p>
      </div>
      <div className={`flex flex-col gap-3.5 min-w-0 ${open ? '' : 'max-lg:hidden'}`}>
        <div className="flex flex-col gap-0.5">
          <button type="button" className={`${ui.backLink} lg:hidden`} onClick={() => onSection(undefined)}><Icon name="back" size={20} stroke={2} />{tr('Settings')}</button>
          <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr(sectionTitle(shown))}</h2>
        </div>
        {sections.map((s) => <div key={s.id} className={shown === s.id ? 'flex flex-col gap-3.5 [&>*]:m-0' : 'hidden'}>{parts[s.id]}</div>)}
      </div>
    </section>
  );
}
