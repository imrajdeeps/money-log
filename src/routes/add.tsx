import { createFileRoute } from '@tanstack/react-router';

// Add expense on a page of its own (/add), optionally with a category already chosen (?category=Groceries; the form checks the
// name against the person's own list), or opened on Received (?kind=in) to add income. Drawn by the shell; see __root.tsx.
export const Route = createFileRoute('/add')({
  validateSearch: (search: Record<string, unknown>): { category?: string; kind?: 'in' } => {
    const c = typeof search.category === 'string' ? search.category.trim().slice(0, 80) : '';
    return { ...(c ? { category: c } : {}), ...(search.kind === 'in' ? { kind: 'in' as const } : {}) };
  },
});
