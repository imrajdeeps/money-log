import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useMatches, useNavigate, useSearch } from '@tanstack/react-router';
import { AppProvider, useApp } from './context.tsx';
import type { SettingsSection } from './settingsSections.ts';
import { BentoSkeleton } from './components/Bento.tsx';
import { DetailDrawer } from './components/DetailDrawer.tsx';
import type { DrawerHandle } from './components/DetailDrawer.tsx';
import { Icon } from './components/Icon.tsx';
import type { IconName } from './components/Icon.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { QuickLog } from './components/QuickLog.tsx';
import { AllPayments } from './components/AllPayments.tsx';
import { SyncPill } from './components/SyncPill.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { ExportScreen } from './screens/ExportScreen.tsx';
import { GroupsScreen } from './screens/GroupsScreen.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import type { Section } from './screens/HomeScreen.tsx';
import type { Group } from './logic.ts';
import { MonthScreen } from './screens/MonthScreen.tsx';
import { PlanScreen } from './screens/PlanScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';

// Every tab is a page with its own address (/month, /plan, /groups, /export, /payments, /settings), so a refresh and the
// back button stay where they were. The Overview and Settings stay mounted behind the others (they keep their place);
// the other pages are drawn only while they are showing. The one thing that is still a sheet is Add expense, because it
// must open straight from the tap so a phone shows its keyboard at once.
type Page = 'home' | 'settings' | Section;

const ROUTES = { month: '/month', plan: '/plan', groups: '/groups', export: '/export', payments: '/payments' } as const;
const SECTIONS = Object.keys(ROUTES) as Section[];
const TITLES: Record<Section, string> = { month: 'Month', plan: 'Plan', groups: 'Groups', export: 'Export to the spreadsheet', payments: 'All payments' };

const NAV: { id: Section; label: string; icon: IconName }[] = [
  { id: 'month', label: 'Month', icon: 'month' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'groups', label: 'Groups', icon: 'groups' },
  { id: 'export', label: 'Export', icon: 'export' },
];

function PageBody({ title, back, onBack, children }: { title: string; back?: boolean; onBack?: () => void; children: ReactNode }) {
  return (
    <section className="page" aria-labelledby="page-title">
      {back && <button type="button" className="settings-back" onClick={onBack}><Icon name="chevron" size={20} />Overview</button>}
      <div className="pagehead"><h2 id="page-title">{title}</h2></div>
      {children}
    </section>
  );
}

function Shell() {
  const app = useApp();
  const navigate = useNavigate();
  const routeId = useMatches({ select: (ms) => ms[ms.length - 1]?.routeId });
  const page: Page = routeId === '/settings' ? 'settings' : SECTIONS.find((s) => routeId === ROUTES[s]) ?? 'home';
  const section = useSearch({ from: '/settings', shouldThrow: false })?.s;
  const group = useSearch({ from: '/month', shouldThrow: false })?.g; // the Month page shows just this group's categories
  const [adding, setAdding] = useState(false); // the Add expense sheet is open
  const amountRef = useRef<HTMLInputElement>(null);
  const addRef: RefObject<DrawerHandle | null> = useRef<DrawerHandle>(null);
  const anchor = useRef<string | undefined>(undefined); // a part of the next page to scroll to (net worth, on the Plan page)

  const closeAdd = useCallback(() => addRef.current?.close(), []);
  // Straight from the tap, so the amount field gets the focus (and a phone its keyboard) at once.
  const openAdd = useCallback(() => addRef.current?.open(), []);
  const goHome = useCallback(() => { closeAdd(); void navigate({ to: '/' }); }, [closeAdd, navigate]);
  const goPage = useCallback((to: Section, part?: string) => { closeAdd(); anchor.current = part; void navigate({ to: ROUTES[to] }); }, [closeAdd, navigate]);
  const goMonth = useCallback((g?: Group) => { closeAdd(); void navigate({ to: '/month', search: g ? { g } : {} }); }, [closeAdd, navigate]);
  const goSettings = useCallback((to?: SettingsSection) => { closeAdd(); void navigate({ to: '/settings', search: to ? { s: to } : {} }); }, [closeAdd, navigate]);
  // Whichever way the address changed (a tap, the back button, a link), the sheet closes and the page starts at the top,
  // or at the part that was asked for.
  useEffect(() => {
    closeAdd();
    const part = anchor.current ? document.getElementById(anchor.current) : null;
    anchor.current = undefined;
    if (part) part.scrollIntoView(); else window.scrollTo(0, 0);
  }, [page, section, group, closeAdd]);

  // A reset link was opened: the new password is chosen in Settings. A link that failed: a new one is asked for there.
  useEffect(() => {
    if (app.ready && !app.locked && (app.recovering || app.authNotice)) goSettings(app.recovering ? 'password' : 'account');
  }, [app.ready, app.recovering, app.authNotice, app.locked, goSettings]);
  // A join link was opened: show where it can be used, once the PIN screen (if any) is out of the way.
  useEffect(() => { if (app.ready && app.joinCode && !app.locked) goPage('groups'); }, [app.ready, app.joinCode, app.locked, goPage]);
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
  const current = (id: Page) => (page === id ? 'page' : undefined);

  return (
    <>
      {app.locked && <LockScreen />}
      <div className="app" inert={app.locked}>
      <header className="top">
        <div className="brand"><h1>Money Log</h1></div>
        <nav className="topnav" aria-label="Sections">
          <button type="button" aria-current={current('home')} onClick={goHome}>Overview</button>
          {NAV.map((n) => <button key={n.id} type="button" aria-current={current(n.id)} onClick={() => goPage(n.id)}>{n.label}</button>)}
          <button type="button" aria-current={current('settings')} onClick={() => goSettings()}>Settings</button>
        </nav>
        <div className="top-actions">
          <SyncPill onOpenSettings={() => goSettings('account')} />
          <ThemeToggle />
          <button type="button" className="btn addbtn" aria-haspopup="dialog" onClick={openAdd}><Icon name="plus" size={20} />Add expense</button>
          <button type="button" className="iconbtn gear" aria-label="Settings" aria-current={current('settings')} onClick={() => goSettings()}>
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
        <div hidden={page !== 'home'}><HomeScreen open={goPage} openMonth={goMonth} openAdd={openAdd} goSettings={() => goSettings()} manageRecurring={() => goSettings('recurring')} /></div>
        <div hidden={page !== 'settings'} className="narrow">
          <SettingsScreen section={section} onSection={(s) => goSettings(s)} />
        </div>
        {page === 'month' && <PageBody title={TITLES.month}><MonthScreen group={group} onGroup={goMonth} /></PageBody>}
        {page === 'plan' && <PageBody title={TITLES.plan}><PlanScreen openSettings={() => goSettings('plan')} /></PageBody>}
        {page === 'groups' && <PageBody title={TITLES.groups}><GroupsScreen openSettings={() => goSettings('account')} /></PageBody>}
        {page === 'export' && <PageBody title={TITLES.export}><ExportScreen /></PageBody>}
        {page === 'payments' && <PageBody title={TITLES.payments} back onBack={goHome}><AllPayments /></PageBody>}
      </main>

      <DetailDrawer ref={addRef} title="Add expense" initialFocus={amountRef} onOpenChange={setAdding}>
        <QuickLog amountRef={amountRef} onSaved={closeAdd} />
        {adding && toast}
      </DetailDrawer>

      <nav className="tabs" aria-label="Sections">
        <button type="button" aria-current={current('home')} onClick={goHome}>
          <Icon name="home" />Home
        </button>
        <button type="button" aria-current={current('month')} onClick={() => goPage('month')}><Icon name="month" />Month</button>
        <button type="button" className="fab" aria-label="Add expense" aria-haspopup="dialog" onClick={openAdd}>
          <span className="fab-circle"><Icon name="plus" size={26} /></span>
          <span aria-hidden="true">Add</span>
        </button>
        <button type="button" aria-current={current('plan')} onClick={() => goPage('plan')}><Icon name="plan" />Plan</button>
        <button type="button" aria-current={current('groups')} onClick={() => goPage('groups')}><Icon name="groups" />Groups</button>
      </nav>
      {adding ? <div className="toast" role="status" aria-live="polite" /> : toast}
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
