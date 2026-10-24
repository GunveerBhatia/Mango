"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const TABS = [
  { href: "/", label: "Games" },
  { href: "/props", label: "Props" },
  { href: "/record", label: "My Record" },
];

export function Nav() {
  return (
    <Suspense fallback={<NavBar path="" />}>
      <ActiveNav />
    </Suspense>
  );
}

function ActiveNav() {
  return <NavBar path={usePathname()} />;
}

function NavBar({ path }: { path: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" || path.startsWith("/game") : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`py-4 text-center text-sm font-medium ${active ? "text-fg" : "text-faint"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
