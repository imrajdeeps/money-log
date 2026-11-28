// Which parts of Hisaab show (version 2.1, Settings, Features). The owner: "net-worth is a complex feature, take a flag in the setting by
// default turned off … but this does not mean that on turning off the existing data will vanish"; "hide the plan section in setting, by
// default off". A part that is off is only hidden: its pages, its Overview tiles, its notes on the bell and its tour steps. Nothing is
// deleted and everything keeps syncing. Pure.
import { FEATURES_ID } from './goals.ts';
import type { FeatureSettings, Goals } from './goals.ts';
import { FEATURES, isFeature } from './featureKinds.ts';
import { laterThan } from './logic.ts';
import type { Feature } from './featureKinds.ts';
import type { NoticeKind } from './noticeKinds.ts';

export type { Feature } from './featureKinds.ts';

/** What an account starts with: Plan and Net worth off, Udhaar and Insights on. */
export const DEFAULT_ON: readonly Feature[] = ['udhaar', 'insights'];

const settingsOf = (items: Goals): FeatureSettings | null => {
  const s = items[FEATURES_ID];
  return s?.k === 'f' && !s.x ? s : null;
};

/** The parts switched on as the person chose them (the defaults until they change one). */
export function chosenFeatures(items: Goals): Set<Feature> {
  const s = settingsOf(items);
  return new Set(s ? s.on.filter(isFeature) : DEFAULT_ON);
}

/** The parts that show: as chosen, except that Net worth lives inside Plan, so it shows only while Plan is on. */
export function featuresOn(items: Goals): Set<Feature> {
  const on = chosenFeatures(items);
  if (!on.has('plan')) on.delete('worth');
  return on;
}

export function setFeature(items: Goals, feature: Feature, on: boolean, nowIso: string): Goals {
  const cur = settingsOf(items);
  const chosen = chosenFeatures(items);
  if (chosen.has(feature) === on && cur) return items;
  if (on) chosen.add(feature); else chosen.delete(feature);
  const later = (cur?.on ?? []).filter((n) => !isFeature(n)); // parts a newer version added: kept as they are
  const prev = items[FEATURES_ID]?.t;
  return { ...items, [FEATURES_ID]: { id: FEATURES_ID, k: 'f', on: [...FEATURES.filter((f) => chosen.has(f)), ...later], x: 0, t: prev ? laterThan(prev, nowIso) : nowIso } };
}

// 2.3: the day of the month the net worth check-in comes up, kept in the same item as the name "worth-day-N" (2.1 keeps names it does not
// know, so an older device carries it unchanged). 1 to 28, so every month has it; the 1st until the person picks another.
const DAY_NAME = /^worth-day-([1-9]|1\d|2[0-8])$/;
const DAY_PREFIX = 'worth-day-';

/** The day of the month the net worth check-in comes up. */
export function checkInDay(items: Goals): number {
  const name = settingsOf(items)?.on.find((n) => DAY_NAME.test(n));
  return name ? Number(name.slice(DAY_PREFIX.length)) : 1;
}

export function setCheckInDay(items: Goals, day: number, nowIso: string): Goals {
  if (!Number.isInteger(day) || day < 1 || day > 28 || (checkInDay(items) === day && settingsOf(items) !== null)) return items;
  const cur = settingsOf(items);
  const kept = cur ? cur.on.filter((n) => !DAY_NAME.test(n)) : [...DEFAULT_ON];
  const prev = items[FEATURES_ID]?.t;
  return { ...items, [FEATURES_ID]: { id: FEATURES_ID, k: 'f', on: [...kept, `${DAY_PREFIX}${day}`], x: 0, t: prev ? laterThan(prev, nowIso) : nowIso } };
}

// The notes on the bell that belong to a part: they go when the part is off.
const NOTICES_OF: Partial<Record<Feature, readonly NoticeKind[]>> = { plan: ['due', 'goal'], worth: ['networth'] };

/** The kinds of note to show: the ones switched on, without those of a part that is off. */
export function noticeKindsShown(enabled: ReadonlySet<NoticeKind>, on: ReadonlySet<Feature>): Set<NoticeKind> {
  const out = new Set(enabled);
  for (const f of FEATURES) if (!on.has(f)) for (const k of NOTICES_OF[f] ?? []) out.delete(k);
  return out;
}

/** The fifth place in the bottom bar: Plan when it is on, else Udhaar, else All payments. */
export type LastTab = 'plan' | 'udhaar' | 'payments';
export function lastTab(on: ReadonlySet<Feature>): LastTab {
  if (on.has('plan')) return 'plan';
  return on.has('udhaar') ? 'udhaar' : 'payments';
}
