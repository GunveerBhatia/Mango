import type { ReactNode } from "react";

/**
 * Tap-to-open bottom sheet using the native popover API — no client JS,
 * tap outside to close.
 */
export function Sheet({
  id,
  trigger,
  triggerClassName,
  title,
  children,
}: {
  id: string;
  trigger: ReactNode;
  triggerClassName?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <button type="button" popoverTarget={id} className={triggerClassName}>
        {trigger}
      </button>
      <div id={id} popover="auto" className="sheet">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            className="rounded-full px-3 py-1 text-sm text-muted hover:text-fg"
          >
            Close
          </button>
        </div>
        <div className="text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </>
  );
}
