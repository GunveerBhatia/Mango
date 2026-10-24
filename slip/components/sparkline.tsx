/** Tiny trend line of point margins, oldest → newest. Dots: green win, red loss. */
export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-xs text-faint">No data yet</span>;
  const max = Math.max(10, ...values.map(Math.abs));
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height / 2 - (v / max) * (height / 2 - pad);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Point margin trend" role="img">
      <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="var(--line)" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={v > 0 ? "var(--good)" : "var(--bad)"} />
      ))}
    </svg>
  );
}
