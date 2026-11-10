import { createFileRoute, redirect } from '@tanstack/react-router';

// Any other address (a mistyped one, an old bookmark) goes to the Overview instead of showing a blank page.
export const Route = createFileRoute('/$')({
  beforeLoad: () => { throw redirect({ to: '/', replace: true }); },
});
