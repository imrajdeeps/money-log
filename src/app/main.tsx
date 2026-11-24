import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.ts';
import '../styles/index.css';
import { startTheme } from '../features/settings/index.ts';
import { initLang } from '../data/lang.ts';
import { installCrashHandlers } from '../data/crashes.ts';
import { CrashBar } from '../ui/CrashBar.tsx';
import { RootErrorBoundary } from '../ui/RootErrorBoundary.tsx';

installCrashHandlers(); // first of all: an error from here on is recorded, not lost
startTheme(); // before anything is drawn by React: paint the stored theme and follow the phone's setting
initLang(); // and the chosen language

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <RootErrorBoundary>
        <RouterProvider router={router} />
        <CrashBar />
      </RootErrorBoundary>
    </StrictMode>,
  );
}

// Offline support. The app works without it, just not without a connection.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
