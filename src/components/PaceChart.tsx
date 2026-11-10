interface Props {
  daily: number[]; // spent by the end of each day so far this month
  lastDaily: number[]; // the same for every day of last month
  days: number; // length of this month
  budget: number; // 0 = no budget to draw
  label: string; // the chart in words, for screen readers (the tile shows the same figures as text)
}

const W = 300;
const H = 100;

// This month's spending as it builds up day by day (the brand colour, with a light wash under it), last month's at the
// same days in grey for comparison, and the budget as a dashed threshold. Hand-written SVG: the page loads no chart library.
// It stretches to the tile's width; styles.css keeps the lines 2px and the end dot round whatever the stretch.
export function PaceChart({ daily, lastDaily, days, budget, label }: Props) {
  const last = lastDaily.slice(0, days);
  const top = Math.max(budget, daily[daily.length - 1] ?? 0, last[last.length - 1] ?? 0) || 1;
  const x = (i: number) => (days > 1 ? (i / (days - 1)) * W : 0);
  const y = (v: number) => H - (v / top) * (H - 8);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const now = daily.length - 1;
  const dot = now >= 0 ? `M${x(now).toFixed(1)} ${y(daily[now] ?? 0).toFixed(1)}h0` : '';
  return (
    <svg className="pace" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line className="pace-base" x1={0} y1={H} x2={W} y2={H} />
      {budget > 0 && <line className="pace-budget" x1={0} y1={y(budget)} x2={W} y2={y(budget)} />}
      {last.length > 1 && <path className="pace-last" d={path(last)} />}
      {now > 0 && <path className="pace-area" d={`${path(daily)}L${x(now).toFixed(1)} ${H}L0 ${H}Z`} />}
      {now > 0 && <path className="pace-now" d={path(daily)} />}
      {dot && <path className="pace-ring" d={dot} />}
      {dot && <path className="pace-dot" d={dot} />}
    </svg>
  );
}
