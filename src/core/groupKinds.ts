import { tr } from './i18n.ts';

// The kinds a shared group can have. The database allows exactly these names (supabase/schema.sql); what each kind offers
// is decided here, so a kind can be added in one place. Pure data and helpers: no DOM, no storage, no network.
export const GROUP_KINDS = [
  { id: 'family', label: 'Family', blurb: 'A household that goes on and on. Up to 20 people.', max: 20 },
  { id: 'trip', label: 'Trip', blurb: 'A holiday or outing with friends or family, settled up at the end. Up to 20 people.', max: 20 },
  { id: 'flatmates', label: 'Flatmates', blurb: 'Shared home costs such as rent and bills. Up to 20 people.', max: 20 },
  { id: 'couple', label: 'Couple', blurb: 'Just the two of you. Two people only.', max: 2 },
] as const;

export type GroupKind = (typeof GROUP_KINDS)[number]['id'];

export const isGroupKind = (v: unknown): v is GroupKind => GROUP_KINDS.some((k) => k.id === v);
export const kindLabel = (kind: GroupKind): string => tr(GROUP_KINDS.find((k) => k.id === kind)?.label ?? kind);

export const kindMax = (kind: GroupKind): number => GROUP_KINDS.find((k) => k.id === kind)?.max ?? 20;

// Whether another person can still join a group of this kind that has `people` in it now (the database enforces it too).
export const hasRoom = (kind: GroupKind, people: number): boolean => people < kindMax(kind);
