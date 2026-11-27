// The words for each part a person can turn on (Settings, Features; version 2.1), written out so each can be translated.
import type { Feature } from '../../core/features.ts';

export const FEATURE_NAMES: Record<Feature, string> = {
  plan: 'Plan',
  worth: 'Net worth',
  udhaar: 'Udhaar',
  insights: 'Insights and cash flow',
};

export const FEATURE_TEXT: Record<Feature, string> = {
  plan: 'Goals, the due list and the calendar file. Adds Plan to the bottom bar.',
  worth: 'What you own and owe, and how it moves. Shows inside Plan and on the Overview.',
  udhaar: 'Money lent and borrowed with friends, outside groups.',
  insights: 'Charts of your spending, and money in and out each month.',
};
