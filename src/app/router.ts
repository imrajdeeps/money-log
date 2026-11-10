import { createRouter } from '@tanstack/react-router';
import { BASEPATH } from '../core/paths.ts';
import { routeTree } from '../routeTree.gen.ts';

export const router = createRouter({ routeTree, basepath: BASEPATH });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
