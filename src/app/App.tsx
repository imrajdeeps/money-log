import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMatches, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AppProvider, useApp } from '../data/context.tsx';
import { cleanSection } from '../features/settings/index.ts';
import type { SettingsSection } from '../features/settings/index.ts';
import { Splash } from '../ui/Splash.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { IconName } from '../ui/Icon.tsx';
import { LockScreen } from '../features/settings/index.ts';
import { QuickLog } from '../features/payments/index.ts';
import { AllPayments } from '../features/payments/index.ts';
import { SyncPill } from '../ui/SyncPill.tsx';
import { ThemeToggle } from '../features/settings/index.ts';
import { ExportScreen } from '../features/export/index.ts';
import { GoalsScreen } from '../features/goals/index.ts';
import { AnalyticsScreen } from '../features/analytics/index.ts';
import { GroupsScreen } from '../features/groups/index.ts';
import { HomeScreen } from '../features/home/index.ts';
import type { Section } from '../features/home/index.ts';
import type { Group } from '../core/logic.ts';
import { MonthScreen } from '../features/month/index.ts';
import { PlanScreen } from '../features/plan/index.ts';
import { SettingsScreen } from '../features/settings/index.ts';
import { TourHost } from '../features/tour/index.ts';
import type { TourPage } from '../core/tour.ts';
import { VERSION } from '../core/version.ts';
import { useLang } from '../data/useLang.ts';
import * as ui from '../ui/styles.ts';
import * as sh from './shellStyles.ts';
import { tr } from '../core/i18n.ts';

// Everything is a page with its own address, so a refresh and the back button stay where they were:
//   /  /month  /plan  /export  /payments  /add  /groups  /groups/<id>  /settings  /settings/<part>
// The Overview, Settings and Add expense stay mounted behind the others (they keep their place and a half-typed payment);
// the other pages are drawn only while they are showing.
type Page = 'home' | 'settings' | 'add' | Section;

const ROUTES = { month: '/month', plan: '/plan', groups: '/groups', export: '/export', payments: '/payments', goals: '/goals', analytics: '/analytics' } as const;
const SECTIONS = Object.keys(ROUTES) as Section[];
const TITLES: Record<Section, string> = { month: 'Month', plan: 'Plan', groups: 'Groups', export: 'Export to the spreadsheet', payments: 'All payments', goals: 'Goals', analytics: 'Insights' };

const SPLASH_MS = 900; // how long the start screen stays, at least

const NAV: { id: Section; label: string; icon: IconName }[] = [
  { id: 'month', label: 'Month', icon: 'month' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'groups', label: 'Groups', icon: 'groups' },
  { id: 'analytics', label: 'Insights', icon: 'month' },
  { id: 'export', label: 'Export', icon: 'export' },
];

function PageBody({ title, back, backLabel = tr('Overview'), onBack, children }: { title: string; back?: boolean; backLabel?: string; onBack?: () => void; children: ReactNode }) {
  return (
    <section className={`${sh.page} animate-page-in`} aria-labelledby="page-title">
      {back && <button type="button" className={ui.backLink} onClick={onBack}><Icon name="chevron" size={20} />{backLabel}</button>}
      <div className={ui.pageHead}><h2 id="page-title">{tr(title)}</h2></div>
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
  const addCategory = useSearch({ from: '/add', shouldThrow: false })?.category; // Add expense starts with this category
  // The start screen stays for at least a moment (not at all with reduced motion), then fades while the app appears under it.
  const [held, setHeld] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const t = window.setTimeout(() => setHeld(true), reduced ? 0 : SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);
  const showApp = app.ready && held;
  useEffect(() => {
    if (!showApp) return;
    const t = window.setTimeout(() => setSplashGone(true), 350);
    return () => window.clearTimeout(t);
  }, [showApp]);
  const amountRef = useRef<HTMLInputElement>(null);
  const anchor = useRef<string | undefined>(undefined); // a part of the next page to scroll to (net worth, on the Plan page)

  const goHome = useCallback(() => { void navigate({ to: '/' }); }, [navigate]);
  const goAdd = useCallback(() => { void navigate({ to: '/add' }); }, [navigate]);
  const goAddFor = useCallback((category: string) => { void navigate({ to: '/add', search: { category } }); }, [navigate]);
  const goPage = useCallback((to: Section, part?: string) => { anchor.current = part; void navigate({ to: ROUTES[to] }); }, [navigate]);
  const goMonth = useCallback((g?: Group) => { void navigate({ to: '/month', search: g ? { g } : {} }); }, [navigate]);
  const goGroup = useCallback((id?: string) => { void navigate(id ? { to: '/groups/$groupId', params: { groupId: id } } : { to: '/groups' }); }, [navigate]);
  const goSettings = useCallback((to?: SettingsSection) => { void navigate(to ? { to: '/settings/$part', params: { part: to } } : { to: '/settings' }); }, [navigate]);
  // the tour moves the page behind its card
  const tourGo = useCallback((to: TourPage) => {
    if (to === 'home') goHome();
    else if (to === 'settings') goSettings();
    else if (to === 'about') goSettings('about');
    else goPage(to);
  }, [goHome, goSettings, goPage]);
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

  if (!showApp) return <Splash />;

  const toast = <div key={app.toastMsg} className={`${sh.toast} animate-toast`} role="status" aria-live="polite">{app.toastMsg}</div>; // a new message is a new element, so it slides in again
  const current = (id: Page) => (page === id || (id === 'plan' && page === 'goals') ? 'page' : undefined); // the Goals page belongs to Plan

  return (
    <>
      {!splashGone && <Splash leaving />}
      {app.locked && <LockScreen />}
      <TourHost version={VERSION} ready={showApp && splashGone && !app.locked && !app.joinCode && !app.recovering} hasData={app.entries.length > 0 || app.groups.length > 0} go={tourGo} />
      <div className={sh.app} inert={app.locked}>
      <header className={sh.top}>
        <div className={sh.brand}><h1>{tr('Money Log')}</h1></div>
        <nav className={sh.topNav} aria-label={tr('Sections')}>
          <button type="button" data-tour="home" className={sh.topNavBtn(!!current('home'))} aria-current={current('home')} onClick={goHome}>{tr('Overview')}</button>
          {NAV.map((n) => <button key={n.id} type="button" data-tour={n.id} className={sh.topNavBtn(!!current(n.id))} aria-current={current(n.id)} onClick={() => goPage(n.id)}>{tr(n.label)}</button>)}
          <button type="button" data-tour="settings" className={sh.topNavBtn(!!current('settings'))} aria-current={current('settings')} onClick={() => goSettings()}>{tr('Settings')}</button>
        </nav>
        <div className={sh.topActions}>
          <SyncPill onOpenSettings={() => goSettings('account')} />
          <ThemeToggle />
          <button type="button" data-tour="add" className={ui.btn('solid', 'none', sh.addBtn)} aria-current={current('add')} onClick={goAdd}><Icon name="plus" size={20} />{tr('Add expense')}</button>
          <button type="button" data-tour="settings" className={`${ui.iconBtn} ${sh.gear}`} aria-label={tr('Settings')} aria-current={current('settings')} onClick={() => goSettings()}>
            <Icon name="settings" />
          </button>
        </div>
      </header>
      {app.storageKind === 'memory' && (
        <p className={ui.banner} role="alert">
          {tr('This browser would not let Money Log keep data, so payments will be lost when you close it. Open it in a normal (not private) window.')}
        </p>
      )}
      <main className={sh.main}>
        <div hidden={page !== 'home'} className="animate-page-in"><HomeScreen open={goPage} openMonth={goMonth} openGroup={goGroup} openAdd={goAdd} goSettings={() => goSettings()} manageRecurring={() => goSettings('recurring')} /></div>
        <div hidden={page !== 'settings'} className={`${sh.narrow} animate-page-in`}>
          <SettingsScreen section={section} onSection={(s) => goSettings(s)} />
        </div>
        <div hidden={page !== 'add'} className={`${sh.narrow} animate-page-in`}>
          <PageBody title={tr('Add expense')} back onBack={goHome}><QuickLog amountRef={amountRef} onSaved={goHome} category={addCategory} /></PageBody>
        </div>
        {page === 'month' && <PageBody title={TITLES.month}><MonthScreen group={group} onGroup={goMonth} onAddExpense={goAddFor} onInsights={() => goPage('analytics')} /></PageBody>}
        {page === 'plan' && <PageBody title={TITLES.plan}><PlanScreen openSettings={() => goSettings('plan')} openGoals={() => goPage('goals')} /></PageBody>}
        {page === 'groups' && <PageBody title={TITLES.groups}><GroupsScreen groupId={groupId} onOpen={goGroup} openSettings={() => goSettings('account')} /></PageBody>}
        {page === 'goals' && <PageBody title={TITLES.goals} back backLabel={tr('Plan')} onBack={() => goPage('plan')}><GoalsScreen /></PageBody>}
        {page === 'analytics' && <PageBody title={TITLES.analytics}><AnalyticsScreen /></PageBody>}
        {page === 'export' && <PageBody title={TITLES.export}><ExportScreen /></PageBody>}
        {page === 'payments' && <PageBody title={TITLES.payments} back onBack={goHome}><AllPayments /></PageBody>}
      </main>


      <nav className={sh.tabs} aria-label={tr('Sections')}>
        <button type="button" data-tour="home" className={sh.tabBtn(!!current('home'))} aria-current={current('home')} onClick={goHome}>
          <Icon name="home" size={24} duotone={page === 'home'} />{tr('Home')}
        </button>
        <button type="button" data-tour="month" className={sh.tabBtn(!!current('month'))} aria-current={current('month')} onClick={() => goPage('month')}><Icon name="month" size={24} duotone={page === 'month'} />{tr('Month')}</button>
        <button type="button" data-tour="add" className={sh.tabBtn(!!current('add'), true)} aria-label={tr('Add expense')} aria-current={current('add')} onClick={goAdd}>
          <span className={sh.fabCircle}><Icon name="plus" size={26} /></span>
          <span aria-hidden="true">{tr('Add')}</span>
        </button>
        <button type="button" data-tour="plan" className={sh.tabBtn(!!current('plan'))} aria-current={current('plan')} onClick={() => goPage('plan')}><Icon name="plan" size={24} />{tr('Plan')}</button>
        <button type="button" data-tour="groups" className={sh.tabBtn(!!current('groups'))} aria-current={current('groups')} onClick={() => goPage('groups')}><Icon name="groups" size={24} duotone={page === 'groups'} />{tr('Groups')}</button>
      </nav>
      {toast}
      </div>
    </>
  );
}

export default function App() {
  const lang = useLang();
  // the texts are looked up while drawing, so a new language draws the whole screen again from the top (the data stays)
  return (
    <AppProvider>
      <Shell key={lang} />
    </AppProvider>
  );
}
