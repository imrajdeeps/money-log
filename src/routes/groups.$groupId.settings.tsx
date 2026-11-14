import { createFileRoute } from '@tanstack/react-router';

// The settings of one group on a page of its own (/groups/<id>/settings): invite people, the usual split, people, leaving. Drawn by the shell.
export const Route = createFileRoute('/groups/$groupId/settings')({});
