import type { ReactNode } from "react";

/** A collapsed section: one summary line, details one tap away. */
export function Section({
  title,
  summary,
  children,
  source,
  open = false,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  source?: string;
  open?: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-line bg-card" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          {summary && <div className="mt-0.5 truncate text-sm text-muted">{summary}</div>}
        </div>
        <span className="text-faint transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-line p-4 pt-3">
        {children}
        {source && <p className="mt-3 text-[10px] text-faint">Source: {source}</p>}
      </div>
    </details>
  );
}
