// A report of something that went wrong, for the person to copy and send if they want to. It holds the error, the app version, the
// page name and a few facts about the phone's browser, and nothing else: no payments, names or amounts, and no web address beyond the
// page name (an address can carry a pasted bank message after the #). The app sends nothing anywhere; the person decides.

export type CrashWhere = 'screen' | 'error' | 'promise';
export interface Crash { message: string; name: string; stack: string; where: CrashWhere; at: string }
export interface ReportContext { version: string; now: string; href: string; userAgent: string; lang: string; online: boolean; standalone: boolean }

export const MAX_CRASHES = 5; // the report keeps the latest few
const MESSAGE_MAX = 300;
const STACK_LINES = 8;
const STACK_MAX = 1500;
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Text with what follows ? or # in any web address cut off, so a copied report cannot carry a pasted message or a token, and email addresses hidden. */
const scrub = (text: string): string => text.replace(/(https?:\/\/[^\s)#?]+)[#?][^\s)]*/g, '$1').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '(email)');
const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/** What can be read from whatever was thrown: an Error, text, or anything else. */
export function describeError(e: unknown): { message: string; name: string; stack: string } {
  if (e instanceof Error) {
    // Chrome starts the stack with "Name: message", which the report prints on its own; Safari and Firefox do not, so only cut it when it is there
    const head = `${e.name}: ${e.message}`;
    const frames = (e.stack ?? '').startsWith(head) ? (e.stack ?? '').slice(head.length).replace(/^\n/, '') : (e.stack ?? '');
    const stack = frames.split('\n').slice(0, STACK_LINES).join('\n');
    return { message: clip(scrub(e.message), MESSAGE_MAX), name: e.name, stack: clip(scrub(stack), STACK_MAX) };
  }
  if (typeof e === 'string') return { message: clip(scrub(e), MESSAGE_MAX), name: '', stack: '' };
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; name?: unknown };
    return { message: typeof o.message === 'string' ? clip(scrub(o.message), MESSAGE_MAX) : 'An error without a message', name: typeof o.name === 'string' ? o.name : '', stack: '' };
  }
  return { message: 'An error without a message', name: '', stack: '' };
}

/**
 * Things that are not worth alarming anyone with: a browser's harmless layout notice, an error from another site's script (the browser
 * hides its details), something an extension did, and a request the page itself cancelled.
 */
export function isIgnorable(c: { message: string; name: string }, source = ''): boolean {
  if (c.name === 'AbortError') return true;
  if (/^ResizeObserver loop/i.test(c.message)) return true;
  if (/^Script error\.?$/i.test(c.message)) return true;
  return /^(chrome|moz|safari-web)-extension:\/\//.test(source);
}

/** The page name only: no address start, no ? or #, and every long id replaced, e.g. /groups/:id/settings. */
export function cleanPath(href: string): string {
  try { return new URL(href).pathname.replace(UUID_G, ':id'); } catch { return '(unknown)'; }
}

/** The latest crashes, oldest first; the same error twice in a row is kept once. */
export function addCrash(list: readonly Crash[], c: Crash): Crash[] {
  const last = list.at(-1);
  if (last && last.message === c.message && last.where === c.where) return [...list];
  return [...list, c].slice(-MAX_CRASHES);
}

export function buildReport(list: readonly Crash[], ctx: ReportContext): string {
  const head = [
    `Money Log ${ctx.version}`,
    `Time: ${ctx.now}`,
    `Page: ${cleanPath(ctx.href)}`,
    `Browser: ${clip(ctx.userAgent, 200)}`,
    `Language: ${ctx.lang}; ${ctx.online ? 'online' : 'offline'}; ${ctx.standalone ? 'installed app' : 'in the browser'}`,
  ].join('\n');
  const body = list.map((c, i) => [`#${i + 1} (${c.where}, ${c.at})`, `${c.name ? `${c.name}: ` : ''}${c.message}`, c.stack].filter(Boolean).join('\n'));
  return [head, ...body].join('\n\n');
}
