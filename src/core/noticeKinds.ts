// The kinds of notification the notification center can show (see notifications.ts). Kept apart so the goals block, which stores the
// person's switches, and the rules can both name them.
export const NOTICE_KINDS = ['due', 'recurring', 'budget', 'goal', 'group', 'networth', 'backup', 'sync'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
export const isNoticeKind = (v: unknown): v is NoticeKind => typeof v === 'string' && (NOTICE_KINDS as readonly string[]).includes(v);
