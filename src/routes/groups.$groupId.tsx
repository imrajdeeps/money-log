import { createFileRoute } from '@tanstack/react-router';

// One group on a page of its own (/groups/<id>): its balance, expenses, invite and people. Drawn by the shell.
export const Route = createFileRoute('/groups/$groupId')({});
