export const VERSION = '1.8.0';

export const importedOn = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
