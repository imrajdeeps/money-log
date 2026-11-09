import { useState } from 'react';
import { AppProvider, useApp } from './context.tsx';
import { SyncPill } from './components/SyncPill.tsx';
import { ExportScreen } from './screens/ExportScreen.tsx';
import { LogScreen } from './screens/LogScreen.tsx';
import { MonthScreen } from './screens/MonthScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';

type Tab = 'log' | 'month' | 'export' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'log', label: 'Log', icon: '＋' },
  { id: 'month', label: 'Month', icon: '▤' },
  { id: 'export', label: 'Export', icon: '⇪' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function Shell() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>('log');
  if (!app.ready) return <p className="boot" role="status">Opening your payments…</p>;
  const goSettings = () => setTab('settings');
  return (
    <div className="app">
      <header className="top">
        <h1>Money Log</h1>
        <SyncPill onOpenSettings={goSettings} />
      </header>
      {app.storageKind === 'memory' && (
        <p className="banner" role="alert">
          This browser would not let Money Log keep data, so payments will be lost when you close it. Open it in a normal (not private) window.
        </p>
      )}
      <main>
        {/* All four stay mounted so a half-typed payment survives a look at another tab. */}
        <div hidden={tab !== 'log'}><LogScreen active={tab === 'log'} openSettings={goSettings} /></div>
        <div hidden={tab !== 'month'}><MonthScreen openSettings={goSettings} /></div>
        <div hidden={tab !== 'export'}><ExportScreen /></div>
        <div hidden={tab !== 'settings'}><SettingsScreen /></div>
      </main>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden="true" className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="toast" role="status" aria-live="polite">{app.toastMsg}</div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
