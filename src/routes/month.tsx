import { createFileRoute } from '@tanstack/react-router';
import { GROUPS } from '../logic.ts';
import type { Group } from '../logic.ts';

// The Month page: everything, or just one group's categories (?g=Saving). Drawn by the shell; see __root.tsx.
export const Route = createFileRoute('/month')({
  validateSearch: (search: Record<string, unknown>): { g?: Group } => {
    const g = GROUPS.find((x) => x === search.g);
    return g ? { g } : {};
  },
});
