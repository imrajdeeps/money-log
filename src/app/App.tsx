import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMatches, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AppProvider, useApp } from '../data/context.tsx';
import { LockScreen, SettingsScreen, ThemeToggle, cleanSection } from '../features/settings/index.ts';
import type { SettingsSection } from '../features/settings/index.ts';
import { Splash } from '../ui/Splash.tsx';
import { Logo } from '../ui/Logo.tsx';
import { playTick } from '../ui/sound.ts';
import { Icon } from '../ui/Icon.tsx';
import type { IconName } from '../ui/Icon.tsx';
import { AllPayments, QuickLog, smsFromHash } from '../features/payments/index.ts';
import { SyncPill } from '../ui/SyncPill.tsx';
import { AnalyticsScreen } from '../features/analytics/index.ts';
import { CashFlowScreen } from '../features/cashflow/index.ts';
import { CircleScreen } from '../features/circle/index.ts';
import { UdhaarScreen } from '../features/udhaar/index.ts';
import { GroupsScreen } from '../features/groups/index.ts';
import { HomeScreen } from '../features/home/index.ts';
import type { Section } from '../features/home/index.ts';
import type { Group } from '../core/logic.ts';
import { MonthScreen } from '../features/month/index.ts';
import { NotificationBell, NotificationsScreen } from '../features/notifications/index.ts';
import { PlanScreen } from '../features/plan/index.ts';
import { TourHost } from '../features/tour/index.ts';
import type { OpenTarget } from '../core/notifications.ts';
import type { TourPage } from '../core/tour.ts';
import { VERSION } from '../core/version.ts';
import { useLang } from '../data/useLang.ts';
import * as ui from '../ui/styles.ts';
import * as sh from './shellStyles.ts';
import { tr } from '../core/i18n.ts';

// Everything is a page with its own address, so a refresh and the back button stay where they were:
//   /  /month  /plan  /payments  /add  /groups  /circle  /groups/<id>  /groups/<id>/settings  /settings  /settings/<part>
// The Overview, Settings and Add expense stay mounted behind the others (they keep their place and a half-typed payment);
// the other pages are drawn only while they are showing.
type Page = 'home' | 'settings' | 'add' | Section;

const ROUTES = { month: '/month', plan: '/plan', groups: '/groups', payments: '/payments', goals: '/goals', analytics: '/analytics', cashflow: '/cashflow', circle: '/circle', udhaar: '/udhaar', notifications: '/notifications' } as const;
const SECTIONS = Object.keys(ROUTES) as Section[];
const TITLES: Record<Section, string> = { month: 'Month', plan: 'Plan', groups: 'Groups', payments: 'All payments', goals: 'Goals', analytics: 'Insights', cashflow: 'Cash flow', circle: 'Circle', udhaar: 'Udhaar', notifications: 'Notifications' };

const SPLASH_MS = 500; // how long the start screen stays, at least

const NAV: { id: Section; label: string; icon: IconName }[] = [
  { id: 'month', label: 'Month', icon: 'month' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'groups', label: 'Groups', icon: 'groups' },
];

function PageBody({ title, back, backLabel = tr('Overview'), onBack, wide = false, width, children }: Readonly<{ title: string; back?: boolean; backLabel?: string; onBack?: () => void; wide?: boolean; width?: 'payments' | 'notes'; children: ReactNode }>) {
  // the page's width on a wide screen, as on the design: All payments 880, Notifications 760 (with the 32px sides), the rest 720 or the whole frame
  const box = wide ? '' : width === 'payments' ? 'max-w-[816px] mx-auto' : width === 'notes' ? 'max-w-[696px] mx-auto' : sh.page;
  return (
    <section className={`${box} ${back ? '-mt-2' : ''} animate-page-in`} aria-labelledby="page-title">
      <div className="flex flex-col gap-0.5 mb-[18px]">
        {back && <button type="button" className={ui.backLink} onClick={onBack}><Icon name="back" size={20} stroke={2} />{backLabel}</button>}
        <h2 id="page-title" className="m-0 text-[24px] leading-[30px] font-bold">{tr(title)}</h2>
      </div>
      {children}
    </section>
  );
}

function Shell() {
  const app = useApp();
  const navigate = useNavigate();
  const routeId = useMatches({ select: (ms) => ms.at(-1)?.routeId });
  const page: Page = routeId?.startsWith('/settings') ? 'settings' : routeId === '/add' ? 'add' : SECTIONS.find((s) => routeId === ROUTES[s] || routeId?.startsWith(`${ROUTES[s]}/`)) ?? 'home';
  const params = useParams({ strict: false }) as { part?: string; groupId?: string };
  const section = cleanSection(params.part); // the part of Settings that is open, if any
  const groupId = params.groupId; // the group that is open, if any
  const group = useSearch({ from: '/month', shouldThrow: false })?.g; // the Month page shows just this group's categories
  const addSearch = useSearch({ from: '/add', shouldThrow: false });
  const addCategory = addSearch?.category; // Add expense starts with this category
  const addKind = addSearch?.kind; // or on Received
  const addGroup = addSearch?.group; // or for one group
  // a bank message handed over in the address (#sms=...) by a phone shortcut: Add expense reads it once
  const [sms, setSms] = useState<string | null>(() => smsFromHash(window.location.hash));
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
  const clearSms = useCallback(() => {
    setSms(null);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the address bar is only cosmetic */ }
  }, []);
  useEffect(() => {
    const onHash = () => { const t = smsFromHash(window.location.hash); if (t) setSms(t); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const goAdd = useCallback(() => { void navigate({ to: '/add' }); }, [navigate]);
  const goAddIncome = useCallback(() => { void navigate({ to: '/add', search: { kind: 'in' } }); }, [navigate]);
  const goAddGroup = useCallback((id: string) => { void navigate({ to: '/add', search: { group: id } }); }, [navigate]);
  const goAddFor = useCallback((category: string) => { void navigate({ to: '/add', search: { category } }); }, [navigate]);
  const goPage = useCallback((to: Section, part?: string) => { anchor.current = part; void navigate({ to: ROUTES[to] }); }, [navigate]);
  const goMonth = useCallback((g?: Group) => { void navigate({ to: '/month', search: g ? { g } : {} }); }, [navigate]);
  const goGroup = useCallback((id?: string, settings = false) => {
    if (!id) void navigate({ to: '/groups' });
    else void navigate(settings ? { to: '/groups/$groupId/settings', params: { groupId: id } } : { to: '/groups/$groupId', params: { groupId: id } });
  }, [navigate]);
  const goSettings = useCallback((to?: SettingsSection) => { void navigate(to ? { to: '/settings/$part', params: { part: to } } : { to: '/settings' }); }, [navigate]);
  // a notification opens the screen it is about
  const openNotice = useCallback((t: OpenTarget) => {
    if (t.to === 'plan') goPage('plan', t.part);
    else if (t.to === 'month') goMonth();
    else if (t.to === 'group') goGroup(t.id);
    else goSettings(t.part);
  }, [goPage, goMonth, goGroup, goSettings]);
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
  useEffect(() => { if (sms && app.ready && !app.locked) goAdd(); }, [sms, app.ready, app.locked, goAdd]);
  useEffect(() => { if (app.ready && app.circleCode && !app.locked) goPage('circle'); }, [app.ready, app.circleCode, app.locked, goPage]);
  // The PIN screen must not sit under an open dialog (they are drawn above the page): close them all before it is painted
  // and before it puts the focus in its PIN field.
  useLayoutEffect(() => {
    if (app.locked) document.querySelectorAll<HTMLDialogElement>('.app dialog[open]').forEach((d) => d.close());
  }, [app.locked]);

  useEffect(() => { if (app.toastMsg) playTick(); }, [app.toastMsg]); // a soft tick as a message appears (off in Settings)

  if (!showApp) return <Splash />;

  const toast = (
    <div key={app.toastMsg} className={`${sh.toast} animate-toast`} role="status" aria-live="polite">
      {app.toastMsg}
      {app.toastAction && <button type="button" className={sh.toastButton} onClick={() => { const a = app.toastAction!; app.toast(''); void a.run(); }}>{app.toastAction.label}</button>}
    </div>
  ); // a new message is a new element, so it slides in again
  const current = (id: Page) => (page === id || (id === 'plan' && page === 'goals') ? 'page' : undefined); // the Goals page belongs to Plan

  return (
    <>
      {!splashGone && <Splash leaving />}
      {app.locked && <LockScreen />}
      <TourHost version={VERSION} ready={showApp && splashGone && !app.locked && !app.joinCode && !app.recovering} hasData={app.entries.length > 0} go={tourGo} onStart={(c) => { if (c === 'split') goPage('groups'); else goAdd(); }} />
      <div className={sh.app} inert={app.locked}>
      <header className={page === 'add' ? `${sh.top} max-lg:hidden` : sh.top}>
        <div className={sh.topRow}>
        <div className={sh.brand}><Logo size={30} /><h1>{tr('Hisaab')}</h1></div>
        <nav className={sh.topNav} aria-label={tr('Sections')}>
          <button type="button" data-tour="home" className={sh.topNavBtn(!!current('home'))} aria-current={current('home')} onClick={goHome}>{tr('Overview')}</button>
          {NAV.map((n) => <button key={n.id} type="button" data-tour={n.id} className={sh.topNavBtn(!!current(n.id))} aria-current={current(n.id)} onClick={() => goPage(n.id)}>{tr(n.label)}</button>)}
          <button type="button" data-tour="settings" className={sh.topNavBtn(!!current('settings'))} aria-current={current('settings')} onClick={() => goSettings()}>{tr('Settings')}</button>
        </nav>
        <div className={sh.topActions}>
          <span className="max-lg:hidden"><SyncPill onOpenSettings={() => goSettings('account')} /></span>
          <NotificationBell onOpen={() => goPage('notifications')} current={page === 'notifications'} />
          <ThemeToggle />
          <button type="button" data-tour="add" className={ui.btn('solid', 'none', sh.addBtn)} aria-current={current('add')} onClick={goAdd}><Icon name="plus" size={20} />{tr('Add expense')}</button>
          <button type="button" data-tour="settings" className={`${ui.iconBtn} ${sh.gear}`} aria-label={tr('Settings')} aria-current={current('settings')} onClick={() => goSettings()}>
            <Icon name="settings" />
          </button>
        </div>
        </div>
      </header>
      {app.storageKind === 'memory' && (
        <p className={ui.banner} role="alert">
          {tr('This browser would not let Hisaab keep data, so payments will be lost when you close it. Open it in a normal (not private) window.')}
        </p>
      )}
      <main className={page === 'add' ? sh.mainAdd : sh.main}>
        <div hidden={page !== 'home'} className="animate-page-in"><HomeScreen open={goPage} openMonth={goMonth} openGroup={goGroup} openAdd={goAdd} openAddIncome={goAddIncome} goSettings={() => goSettings()} openAccount={() => goSettings('account')} /></div>
        <div hidden={page !== 'settings'} className={`${sh.narrow} animate-page-in`}>
          <SettingsScreen section={section} onSection={(s) => goSettings(s)} />
        </div>
        <div hidden={page !== 'add'} className="animate-page-in">
          <PageBody title={tr('Add expense')} back onBack={goHome} wide><QuickLog amountRef={amountRef} onSaved={goHome} category={addCategory} kind={addKind} group={addGroup} sms={sms} onSms={clearSms} onSeeAll={() => goPage('payments')} /></PageBody>
        </div>
        {page === 'month' && <div className="animate-page-in"><MonthScreen group={group} onGroup={goMonth} onAddExpense={goAddFor} onInsights={() => goPage('analytics')} onCashFlow={() => goPage('cashflow')} /></div>}
        {(page === 'plan' || page === 'goals') && <PageBody title={TITLES.plan}><PlanScreen onUdhaar={() => goPage('udhaar')} /></PageBody>}
        {page === 'groups' && <PageBody title={TITLES.groups}><GroupsScreen groupId={groupId} settings={routeId === '/groups/$groupId/settings'} onOpen={goGroup} openSettings={() => goSettings('account')} openCircle={() => goPage('circle')} openUdhaar={() => goPage('udhaar')} onAdd={goAddGroup} /></PageBody>}
        {page === 'udhaar' && <PageBody title={TITLES.udhaar} back onBack={goHome}><UdhaarScreen /></PageBody>}
        {page === 'circle' && <PageBody title={TITLES.circle} back backLabel={tr('Groups')} onBack={() => goPage('groups')}><CircleScreen /></PageBody>}
        {page === 'cashflow' && <PageBody title={TITLES.cashflow} back backLabel={tr('Month')} onBack={() => goPage('month')} wide><CashFlowScreen onAdd={goAddIncome} /></PageBody>}
        {page === 'analytics' && <PageBody title={TITLES.analytics} back backLabel={tr('Month')} onBack={() => goPage('month')} wide><AnalyticsScreen /></PageBody>}
        {page === 'notifications' && <PageBody title={TITLES.notifications}><NotificationsScreen onOpen={openNotice} onSettings={() => goSettings('notifications')} /></PageBody>}
        {page === 'payments' && <PageBody title={TITLES.payments} back onBack={goHome} width="payments"><AllPayments /></PageBody>}
      </main>


      <nav className={page === 'add' ? `${sh.tabs} max-lg:hidden` : sh.tabs} aria-label={tr('Sections')}>
        <button type="button" data-tour="home" className={sh.tabBtn(!!current('home'))} aria-current={current('home')} onClick={goHome}>
          <span className={sh.tabIcon(!!current('home'))}><Icon name="home" size={23} stroke={current('home') ? 2 : 1.75} /></span>{tr('Home')}
        </button>
        <button type="button" data-tour="month" className={sh.tabBtn(!!current('month'))} aria-current={current('month')} onClick={() => goPage('month')}><span className={sh.tabIcon(!!current('month'))}><Icon name="month" size={23} stroke={current('month') ? 2 : 1.75} /></span>{tr('Month')}</button>
        <button type="button" data-tour="add" className={sh.fab} aria-label={tr('Add expense')} aria-current={current('add')} onClick={goAdd}><Icon name="plus" size={28} stroke={2.2} /></button>
        <button type="button" data-tour="plan" className={sh.tabBtn(!!current('plan'))} aria-current={current('plan')} onClick={() => goPage('plan')}><span className={sh.tabIcon(!!current('plan'))}><Icon name="plan" size={23} stroke={current('plan') ? 2 : 1.75} /></span>{tr('Plan')}</button>
        <button type="button" data-tour="groups" className={sh.tabBtn(!!current('groups'))} aria-current={current('groups')} onClick={() => goPage('groups')}><span className={sh.tabIcon(!!current('groups'))}><Icon name="groups" size={23} stroke={current('groups') ? 2 : 1.75} /></span>{tr('Groups')}</button>
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
