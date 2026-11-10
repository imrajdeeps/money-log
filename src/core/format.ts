// Display formatting only (the money and date rules live in logic.ts).

const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const monthYear = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const clock = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });

function parts(iso: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return [y, m, d];
}

export function shortDate(iso: string): string {
  const [y, m, d] = parts(iso);
  const date = new Date(y, m - 1, d);
  return (y === new Date().getFullYear() ? dayMonth : dayMonthYear).format(date);
}

export function monthLabel(key: string): string {
  const [y, m] = parts(`${key}-01`);
  return monthYear.format(new Date(y, m - 1, 1));
}

export function clockLabel(ms: number): string {
  return clock.format(new Date(ms));
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
