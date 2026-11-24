import { createRouter } from '@tanstack/react-router';
import { BASEPATH } from '../core/paths.ts';
import { routeTree } from '../routeTree.gen.ts';
import { recordCrash } from '../data/crashes.ts';
import { CrashScreen } from '../ui/CrashScreen.tsx';

// A page that fails to draw shows the crash screen (not the router's own "Show Error" one) and the failure is recorded for the report.
export const router = createRouter({
  routeTree,
  basepath: BASEPATH,
  defaultErrorComponent: CrashScreen,
  defaultOnCatch: (error) => recordCrash(error, 'screen'),
});

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
