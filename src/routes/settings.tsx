import { createFileRoute } from '@tanstack/react-router';
import { cleanSection } from '../settingsSections.ts';
import type { SettingsSection } from '../settingsSections.ts';

// The Settings page: the list of headings, or one part of it (?s=password). Drawn by the shell; see __root.tsx.
export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): { s?: SettingsSection } => {
    const s = cleanSection(search.s);
    return s ? { s } : {};
  },
});
