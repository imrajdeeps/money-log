import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMatches, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AppProvider, useApp } from '../data/context.tsx';
import { cleanSection } from '../features/settings/index.ts';
import type { SettingsSection } from '../features/settings/index.ts';
import { BentoSkeleton } from '../ui/Bento.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { IconName } from '../ui/Icon.tsx';
import { LockScreen } from '../features/settings/index.ts';
import { QuickLog } from '../features/payments/index.ts';
import { AllPayments } from '../features/payments/index.ts';
import { SyncPill } from '../ui/SyncPill.tsx';
import { ThemeToggle } from '../features/settings/index.ts';
import { ExportScreen } from '../features/export/index.ts';
import { GroupsScreen } from '../features/groups/index.ts';
import { HomeScreen } from '../features/home/index.ts';
import type { Section } from '../features/home/index.ts';
import type { Group } from '../core/logic.ts';
import { MonthScreen } from '../features/month/index.ts';
import { PlanScreen } from '../features/plan/index.ts';
import { SettingsScreen } from '../features/settings/index.ts';

// Everything is a page with its own address, so a refresh and the back button stay where they were:
//   /  /month  /plan  /export  /payments  /add  /groups  /groups/<id>  /settings  /settings/<part>
// The Overview, Settings and Add expense stay mounted behind the others (they keep their place and a half-typed payment);
// the other pages are drawn only while they are showing.
type Page = 'home' | 'settings' | 'add' | Section;

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
  const page: Page = routeId?.startsWith('/settings') ? 'settings' : routeId === '/add' ? 'add' : SECTIONS.find((s) => routeId === ROUTES[s] || routeId?.startsWith(`${ROUTES[s]}/`)) ?? 'home';
  const params = useParams({ strict: false }) as { part?: string; groupId?: string };
  const section = cleanSection(params.part); // the part of Settings that is open, if any
  const groupId = params.groupId; // the group that is open, if any
  const group = useSearch({ from: '/month', shouldThrow: false })?.g; // the Month page shows just this group's categories
  const amountRef = useRef<HTMLInputElement>(null);
  const anchor = useRef<string | undefined>(undefined); // a part of the next page to scroll to (net worth, on the Plan page)

  const goHome = useCallback(() => { void navigate({ to: '/' }); }, [navigate]);
  const goAdd = useCallback(() => { void navigate({ to: '/add' }); }, [navigate]);
  const goPage = useCallback((to: Section, part?: string) => { anchor.current = part; void navigate({ to: ROUTES[to] }); }, [navigate]);
  const goMonth = useCallback((g?: Group) => { void navigate({ to: '/month', search: g ? { g } : {} }); }, [navigate]);
  const goGroup = useCallback((id?: string) => { void navigate(id ? { to: '/groups/$groupId', params: { groupId: id } } : { to: '/groups' }); }, [navigate]);
  const goSettings = useCallback((to?: SettingsSection) => { void navigate(to ? { to: '/settings/$part', params: { part: to } } : { to: '/settings' }); }, [navigate]);
  // Whichever way the address changed (a tap, the back button, a link), the page starts at the top, or at the part that
  // was asked for; and Add expense puts the cursor in the amount.
  useEffect(() => {
    const part = anchor.current ? document.getElementById(anchor.current) : null;
    anchor.current = undefined;
    if (part) part.scrollIntoView(); else window.scrollTo(0, 0);
    if (page === 'add') amountRef.current?.focus({ preventScroll: true });
  }, [page, section, group, groupId]);

  // A reset link was opened: the new password is chosen in Settings. A link that failed: a new one is asked for there.
  useEffect(() => {
    if (app.ready && !app.locked && (app.recovering || app.authNotice)) goSettings(app.recovering ? 'password' : 'account');
  }, [app.ready, app.recovering, app.authNotice, app.locked, goSettings]);
  // A join link was opened: show where it can be used, once the PIN screen (if any) is out of the way.
  useEffect(() => { if (app.ready && app.joinCode && !app.locked) goPage('groups'); }, [app.ready, app.joinCode, app.locked, goPage]);
  // The PIN screen must not sit under an open dialog (they are drawn above the page): close them all before it is painted
  // and before it puts the focus in its PIN field.
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
          <button type="button" className="btn addbtn" aria-current={current('add')} onClick={goAdd}><Icon name="plus" size={20} />Add expense</button>
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
        <div hidden={page !== 'home'}><HomeScreen open={goPage} openMonth={goMonth} openAdd={goAdd} goSettings={() => goSettings()} manageRecurring={() => goSettings('recurring')} /></div>
        <div hidden={page !== 'settings'} className="narrow">
          <SettingsScreen section={section} onSection={(s) => goSettings(s)} />
        </div>
        <div hidden={page !== 'add'} className="narrow">
          <PageBody title="Add expense" back onBack={goHome}><QuickLog amountRef={amountRef} onSaved={goHome} /></PageBody>
        </div>
        {page === 'month' && <PageBody title={TITLES.month}><MonthScreen group={group} onGroup={goMonth} /></PageBody>}
        {page === 'plan' && <PageBody title={TITLES.plan}><PlanScreen openSettings={() => goSettings('plan')} /></PageBody>}
        {page === 'groups' && <PageBody title={TITLES.groups}><GroupsScreen groupId={groupId} onOpen={goGroup} openSettings={() => goSettings('account')} /></PageBody>}
        {page === 'export' && <PageBody title={TITLES.export}><ExportScreen /></PageBody>}
        {page === 'payments' && <PageBody title={TITLES.payments} back onBack={goHome}><AllPayments /></PageBody>}
      </main>


      <nav className="tabs" aria-label="Sections">
        <button type="button" aria-current={current('home')} onClick={goHome}>
          <Icon name="home" />Home
        </button>
        <button type="button" aria-current={current('month')} onClick={() => goPage('month')}><Icon name="month" />Month</button>
        <button type="button" className="fab" aria-label="Add expense" aria-current={current('add')} onClick={goAdd}>
          <span className="fab-circle"><Icon name="plus" size={26} /></span>
          <span aria-hidden="true">Add</span>
        </button>
        <button type="button" aria-current={current('plan')} onClick={() => goPage('plan')}><Icon name="plan" />Plan</button>
        <button type="button" aria-current={current('groups')} onClick={() => goPage('groups')}><Icon name="groups" />Groups</button>
      </nav>
      {toast}
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
