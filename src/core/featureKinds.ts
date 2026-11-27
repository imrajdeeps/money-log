// The parts of Hisaab a person can turn on or off in Settings, Features (version 2.1). Groups, the Overview, Month and Add are always
// there. Kept apart from features.ts so goals.ts can check stored values without importing the rules (no import cycle).
export const FEATURES = ['plan', 'worth', 'udhaar', 'insights'] as const;
export type Feature = (typeof FEATURES)[number];

export const isFeature = (v: unknown): v is Feature => typeof v === 'string' && (FEATURES as readonly string[]).includes(v);
