import { createFileRoute, redirect } from '@tanstack/react-router';
import { cleanSection } from '../settingsSections.ts';

// The Settings list (/settings). Drawn by the shell; see __root.tsx.
// An older link, /settings?s=password, goes to the page it meant: /settings/password.
export const Route = createFileRoute('/settings/')({
  validateSearch: (search: Record<string, unknown>): { s?: string } => (typeof search.s === 'string' ? { s: search.s } : {}),
  beforeLoad: ({ search }) => {
    const part = cleanSection(search.s);
    if (part) throw redirect({ to: '/settings/$part', params: { part }, replace: true });
  },
});
