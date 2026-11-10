import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useMatch, useNavigate, useSearch } from '@tanstack/react-router';
import { AppProvider, useApp } from './context.tsx';
import type { SettingsSection } from './settingsSections.ts';
import { BentoSkeleton } from './components/Bento.tsx';
import { DetailDrawer } from './components/DetailDrawer.tsx';
import type { DrawerHandle } from './components/DetailDrawer.tsx';
import { Icon } from './components/Icon.tsx';
import type { IconName } from './components/Icon.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { QuickLog } from './components/QuickLog.tsx';
import { RecentList } from './components/RecentList.tsx';
import { SyncPill } from './components/SyncPill.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { ExportScreen } from './screens/ExportScreen.tsx';
import { GroupsScreen } from './screens/GroupsScreen.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import type { Section } from './screens/HomeScreen.tsx';
import { MonthScreen } from './screens/MonthScreen.tsx';
import { PlanScreen } from './screens/PlanScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';

// Two pages (the dashboard and Settings) and, over them, the sheets that hold everything else. The sheets stay mounted
// while closed, so a half-typed payment or a half-filled group form survives a look elsewhere. Which page shows is the
// address (/ or /settings, see src/routes), so a refresh stays where it was.
type Page = 'home' | 'settings';
type Sheet = Section | 'add';

const NAV: { id: Section; label: string; icon: IconName }[] = [
  { id: 'month', label: 'Month', icon: 'month' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'groups', label: 'Groups', icon: 'groups' },
  { id: 'export', label: 'Export', icon: 'export' },
];

function Shell() {
  const app = useApp();
  const navigate = useNavigate();
  const page: Page = useMatch({ from: '/settings', shouldThrow: false }) ? 'settings' : 'home';
  const section = useSearch({ from: '/settings', shouldThrow: false })?.s;
  const [sheet, setSheet] = useState<Sheet | null>(null); // the sheet that is open, if any
  const [monthKey, setMonthKey] = useState(0);
  const amountRef = useRef<HTMLInputElement>(null);
  const refs: Record<Sheet, RefObject<DrawerHandle | null>> = {
    add: useRef<DrawerHandle>(null),
    recent: useRef<DrawerHandle>(null),
    month: useRef<DrawerHandle>(null),
    plan: useRef<DrawerHandle>(null),
    groups: useRef<DrawerHandle>(null),
    export: useRef<DrawerHandle>(null),
  };
  const refsRef = useRef(refs);
  refsRef.current = refs;

  const tracked = (id: Sheet) => (isOpen: boolean) => setSheet((cur) => (isOpen ? id : cur === id ? null : cur));
  const closeSheets = useCallback(() => { for (const r of Object.values(refsRef.current)) r.current?.close(); }, []);
  const openSheet = useCallback((id: Section, anchor?: string) => refsRef.current[id].current?.open(anchor), []);
  // Straight from the tap, so the amount field gets the focus (and a phone its keyboard) at once.
  const openAdd = useCallback(() => refsRef.current.add.current?.open(), []);
  const goHome = useCallback(() => { closeSheets(); void navigate({ to: '/' }); }, [closeSheets, navigate]);
  const goSettings = useCallback((to?: SettingsSection) => { closeSheets(); void navigate({ to: '/settings', search: to ? { s: to } : {} }); }, [closeSheets, navigate]);
  // Whichever way the address changed (a tap, the back button, a link), the sheets close and the page starts at the top.
  useEffect(() => { closeSheets(); window.scrollTo(0, 0); }, [page, section, closeSheets]);

  // A reset link was opened: the new password is chosen in Settings. A link that failed: a new one is asked for there.
  useEffect(() => {
    if (app.ready && !app.locked && (app.recovering || app.authNotice)) goSettings(app.recovering ? 'password' : 'account');
  }, [app.ready, app.recovering, app.authNotice, app.locked, goSettings]);
  // A join link was opened: show where it can be used, once the PIN screen (if any) is out of the way.
  useEffect(() => { if (app.ready && app.joinCode && !app.locked) openSheet('groups'); }, [app.ready, app.joinCode, app.locked, openSheet]);
  // The PIN screen must not sit under an open sheet or dialog (they are drawn above the page): close them all before it
  // is painted and before it puts the focus in its PIN field.
  useLayoutEffect(() => {
    if (app.locked) document.querySelectorAll<HTMLDialogElement>('.app dialog[open]').forEach((d) => d.close());
  }, [app.locked]);

  if (!app.ready) {
    return (
      <div className="app">
        <header className="top"><div className="brand"><h1>Money Log</h1></div></header>
        <BentoSkeleton label="Opening your payments…" />
      </div>
    );
  }

  const toast = <div className="toast" role="status" aria-live="polite">{app.toastMsg}</div>;
  const here = (id: Sheet) => (sheet === id ? toast : null);

  return (
    <>
      {app.locked && <LockScreen />}
      <div className="app" inert={app.locked}>
      <header className="top">
        <div className="brand"><h1>Money Log</h1></div>
        <nav className="topnav" aria-label="Sections">
          <button type="button" aria-current={page === 'home' ? 'page' : undefined} onClick={goHome}>Overview</button>
          {NAV.map((n) => <button key={n.id} type="button" aria-haspopup="dialog" onClick={() => openSheet(n.id)}>{n.label}</button>)}
          <button type="button" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => goSettings()}>Settings</button>
        </nav>
        <div className="top-actions">
          <SyncPill onOpenSettings={() => goSettings('account')} />
          <ThemeToggle />
          <button type="button" className="btn addbtn" aria-haspopup="dialog" onClick={openAdd}><Icon name="plus" size={20} />Add expense</button>
          <button type="button" className="iconbtn gear" aria-label="Settings" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => goSettings()}>
            <Icon name="settings" />
          </button>
        </div>
      </header>
      {app.storageKind === 'memory' && (
        <p className="banner" role="alert">
          This browser would not let Money Log keep data, so payments will be lost when you close it. Open it in a normal (not private) window.
        </p>
      )}
      <main>
        <div hidden={page !== 'home'}><HomeScreen open={openSheet} openAdd={openAdd} goSettings={() => goSettings()} /></div>
        <div hidden={page !== 'settings'} className="narrow">
          <SettingsScreen section={section} onSection={(s) => goSettings(s)} />
        </div>
      </main>

      <DetailDrawer ref={refs.add} title="Add expense" initialFocus={amountRef} onOpenChange={tracked('add')}>
        <QuickLog amountRef={amountRef} onSaved={() => refs.add.current?.close()} />
        {here('add')}
      </DetailDrawer>
      <DetailDrawer ref={refs.recent} title="Recent payments" onOpenChange={tracked('recent')}>
        <RecentList limit={20} empty={<p className="muted">No payments yet. Your last 20 appear here.</p>} />
        {here('recent')}
      </DetailDrawer>
      {/* The month view starts again at this month each time it opens. */}
      <DetailDrawer ref={refs.month} title="Month" onOpenChange={(o) => { tracked('month')(o); if (!o) setMonthKey((k) => k + 1); }}>
        <MonthScreen key={monthKey} />
        {here('month')}
      </DetailDrawer>
      <DetailDrawer ref={refs.plan} title="Plan" onOpenChange={tracked('plan')}>
        <PlanScreen openSettings={() => goSettings('plan')} />
        {here('plan')}
      </DetailDrawer>
      <DetailDrawer ref={refs.groups} title="Groups" onOpenChange={tracked('groups')}>
        <GroupsScreen openSettings={() => goSettings('account')} />
        {here('groups')}
      </DetailDrawer>
      <DetailDrawer ref={refs.export} title="Export to the spreadsheet" onOpenChange={tracked('export')}>
        <ExportScreen />
        {here('export')}
      </DetailDrawer>

      <nav className="tabs" aria-label="Sections">
        <button type="button" aria-current={page === 'home' ? 'page' : undefined} onClick={goHome}>
          <Icon name="home" />Home
        </button>
        <button type="button" aria-haspopup="dialog" onClick={() => openSheet('month')}><Icon name="month" />Month</button>
        <button type="button" className="fab" aria-label="Add expense" aria-haspopup="dialog" onClick={openAdd}>
          <span className="fab-circle"><Icon name="plus" size={26} /></span>
          <span aria-hidden="true">Add</span>
        </button>
        <button type="button" aria-haspopup="dialog" onClick={() => openSheet('plan')}><Icon name="plan" />Plan</button>
        <button type="button" aria-haspopup="dialog" onClick={() => openSheet('groups')}><Icon name="groups" />Groups</button>
      </nav>
      {sheet === null ? toast : <div className="toast" role="status" aria-live="polite" />}
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
