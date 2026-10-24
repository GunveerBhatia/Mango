/** The reasons behind an estimate, as a simple bullet list. */
export function WhyList({ why }: { why: string[] }) {
  if (why.length === 0) return <p>No data yet.</p>;
  const [first, ...rest] = why;
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-black/30 p-3 text-fg">{first}</p>
      <ul className="space-y-2">
        {rest.map((w) => (
          <li key={w} className="flex gap-2">
            <span className="text-faint">•</span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">Estimates, not guarantees. Sources: ESPN stats, ESPN BPI, sportsbook odds.</p>
    </div>
  );
}
