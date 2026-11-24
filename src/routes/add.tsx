import { createFileRoute } from '@tanstack/react-router';

// Add expense on a page of its own (/add), optionally with a category already chosen (?category=Groceries; the form checks the
// name against the person's own list), opened on Received (?kind=in) to add income, or for one group (?group=<id>; the form checks
// that the person is in it). Drawn by the shell; see __root.tsx.
export const Route = createFileRoute('/add')({
  validateSearch: (search: Record<string, unknown>): { category?: string; kind?: 'in'; group?: string } => {
    const c = typeof search.category === 'string' ? search.category.trim().slice(0, 80) : '';
    const g = typeof search.group === 'string' && /^[0-9a-f-]{36}$/i.test(search.group) ? search.group.toLowerCase() : '';
    return { ...(c ? { category: c } : {}), ...(search.kind === 'in' ? { kind: 'in' as const } : {}), ...(g ? { group: g } : {}) };
  },
});
