"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { PropsIndexGame } from "@/lib/props";
import { LocalTime } from "../local-time";

export function PlayerSearch({ games }: { games: PropsIndexGame[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = games
    .map((g) => ({
      ...g,
      players: g.players.filter(
        (p) => !needle || p.name.toLowerCase().includes(needle) || p.teamAbbr.toLowerCase() === needle,
      ),
    }))
    .filter((g) => g.players.length > 0);

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a player or team"
        className="mb-5 w-full rounded-2xl border border-line bg-card px-4 py-3.5 text-base outline-none placeholder:text-faint focus:border-muted"
      />
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No players found.</p>
      ) : (
        <div className="space-y-6">
          {filtered.map((g) => (
            <section key={g.id}>
              <p className="mb-2 flex justify-between text-xs font-medium uppercase tracking-wide text-faint">
                <span>{g.label}</span>
                <LocalTime iso={g.startTime} />
              </p>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {g.players.map((p) => (
                  <li key={p.id}>
                    <Link href={`/props/${p.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-white/5">
                      {p.headshot ? (
                        <Image
                          src={p.headshot}
                          alt=""
                          width={36}
                          height={36}
                          unoptimized
                          className="size-9 rounded-full bg-white/5 object-cover"
                        />
                      ) : (
                        <div className="size-9 rounded-full bg-white/5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted">
                          {p.teamAbbr}
                          {p.position ? ` · ${p.position}` : ""}
                        </p>
                      </div>
                      {p.injury && (
                        <span className={`text-xs ${/out/i.test(p.injury) ? "text-bad" : "text-muted"}`}>{p.injury}</span>
                      )}
                      <span className="text-faint">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
