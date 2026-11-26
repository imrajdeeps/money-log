interface Props {
  daily: number[]; // spent by the end of each day so far this month
  lastDaily: number[]; // the same for every day of last month
  days: number; // length of this month
  budget: number; // 0 = no budget to draw
  projected?: number | null; // where the month ends at this pace (a dashed line from today), or null
  label: string; // the chart in words, for screen readers (the tile shows the same figures as text)
}

// The drawing is 600 by 190, as on the design canvas: day d sits at d/days of the width (day 0 is the start of the month, at zero),
// and the top of the scale is a little above the highest of the budget, the lines and the projection.
const W = 600;
const BASE = 180;
const RANGE = 170;

function paceShape({ daily, lastDaily, days, budget, projected = null }: Props) {
  const last = lastDaily.slice(0, days);
  const top = Math.max(budget, daily.at(-1) ?? 0, last.at(-1) ?? 0, projected ?? 0) * 1.125 || 1;
  const x = (d: number) => (days > 0 ? (d / days) * W : 0);
  const y = (v: number) => BASE - (v / top) * RANGE;
  const path = (vals: number[]) => [0, ...vals].map((v, d) => `${d ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const now = daily.length; // today's day number
  const here = now > 0 ? `${x(now).toFixed(1)} ${y(daily[now - 1] ?? 0).toFixed(1)}` : '';
  const dot = here ? `M${here}h0` : '';
  const proj = projected !== null && here ? `M${here}L${W} ${y(projected).toFixed(1)}` : '';
  return { last, y, path, x, now, dot, proj };
}

// This month's spending as it builds up day by day (lime, with a wash under it), last month's at the same days, the budget as a dashed
// line and the likely month end as a dashed lime line from today. Hand-written SVG: the page loads no chart library.
export function PaceChart(props: Props) {
  const { daily, budget, label } = props;
  const { last, y, path, x, now, dot, proj } = paceShape(props);
  return (
    <svg className="pace" viewBox={`0 0 ${W} 190`} preserveAspectRatio="none" role="img" aria-label={label}>
      {now > 0 && <path className="pace-area" d={`${path(daily)}L${x(now).toFixed(1)} ${BASE}Z`} />}
      {last.length > 1 && <path className="pace-last" d={path(last)} />}
      {budget > 0 && <path className="pace-budget" d={`M0 ${y(budget).toFixed(1)}H${W}`} />}
      {now > 0 && <path className="pace-now" d={path(daily)} />}
      {proj && <path className="pace-proj" d={proj} />}
      {dot && <path className="pace-ring" d={dot} />}
      {dot && <path className="pace-dot" d={dot} />}
    </svg>
  );
}
