// Which parts of Hisaab show (version 2.1, Settings, Features). The owner: "net-worth is a complex feature, take a flag in the setting by
// default turned off … but this does not mean that on turning off the existing data will vanish"; "hide the plan section in setting, by
// default off". A part that is off is only hidden: its pages, its Overview tiles, its notes on the bell and its tour steps. Nothing is
// deleted and everything keeps syncing. Pure.
import { FEATURES_ID } from './goals.ts';
import type { FeatureSettings, Goals } from './goals.ts';
import { FEATURES } from './featureKinds.ts';
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
  return new Set(settingsOf(items)?.on ?? DEFAULT_ON);
}

/** The parts that show: as chosen, except that Net worth lives inside Plan, so it shows only while Plan is on. */
export function featuresOn(items: Goals): Set<Feature> {
  const on = chosenFeatures(items);
  if (!on.has('plan')) on.delete('worth');
  return on;
}

export function setFeature(items: Goals, feature: Feature, on: boolean, nowIso: string): Goals {
  const chosen = chosenFeatures(items);
  if (chosen.has(feature) === on && settingsOf(items)) return items;
  if (on) chosen.add(feature); else chosen.delete(feature);
  return { ...items, [FEATURES_ID]: { id: FEATURES_ID, k: 'f', on: FEATURES.filter((f) => chosen.has(f)), x: 0, t: nowIso } };
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
