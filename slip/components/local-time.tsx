"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Formats a time in the viewer's own time zone (the server doesn't know it). */
export function LocalTime({ iso }: { iso: string }) {
  const onClient = useSyncExternalStore(noop, () => true, () => false);
  if (!onClient) return <span className="opacity-0">0:00 PM</span>;
  const d = new Date(iso);
  return <span>{d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
}
