import { createFileRoute, redirect } from '@tanstack/react-router';
import { cleanSection } from '../settingsSections.ts';

// One part of Settings on a page of its own (/settings/password). A part that does not exist goes back to the list.
export const Route = createFileRoute('/settings/$part')({
  beforeLoad: ({ params }) => {
    if (!cleanSection(params.part)) throw redirect({ to: '/settings', replace: true });
  },
});
