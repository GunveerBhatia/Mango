import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { HowEdgesWork } from "@/components/edge-banner";
import { WinPct } from "@/components/game-card";
import { LocalTime } from "@/components/local-time";
import { Section } from "@/components/section";
import { Sheet } from "@/components/sheet";
import { BetButton } from "@/components/slip/bet-button";
import { Sparkline } from "@/components/sparkline";
import { Tag } from "@/components/tag";
import { WhyList } from "@/components/why-list";
import { getGameDetail, restLabel, type GameDetail, type TeamDetail } from "@/lib/game-detail";
import { formatAmerican, formatPct, formatPoint } from "@/lib/odds-math";
import { legFromGameBet } from "@/lib/slip/legs";
import type { Game, Market } from "@/lib/types";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
const signed = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

function Logo({ src, size = 48 }: { src?: string; size?: number }) {
  return src ? (
    <Image src={src} alt="" width={size} height={size} unoptimized style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-white/10" style={{ width: size, height: size }} />
  );
}

/* ---------- Bets ---------- */

function BetRow({ game, kind, title }: { game: Game; kind: "moneyline" | "spread" | "total"; title: string }) {
  const m: Market | undefined = game.markets[kind];
  const pre = game.status.state === "pre";
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">
        {title}
        {kind === "total" && m ? ` ${formatPoint(m.sides[0].point, false)}` : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as const).map((idx) => {
          const bet = game.bets[`${kind}:${idx}`];
          const side = m?.sides[idx];
          const main =
            kind === "moneyline"
              ? `${side?.label ?? ""} ${formatAmerican(side?.best.american)}`
              : kind === "spread"
                ? `${side?.label ?? ""} ${formatPoint(side?.point)}`
                : `${idx === 0 ? "Over" : "Under"} ${formatAmerican(side?.best.american)}`;
          return (
            <div key={idx}>
              <BetButton
                leg={pre ? legFromGameBet(game, `${kind}:${idx}`) : undefined}
                main={side ? main : "—"}
                sub={kind === "spread" && side ? formatAmerican(side.best.american) : undefined}
                edge={bet?.edge}
              />
              {bet && (
                <Sheet
                  id={`why-${kind}-${idx}`}
                  title={bet.label}
                  triggerClassName="mt-1 w-full text-center text-[11px] tabular-nums text-muted"
                  trigger={
                    <>
                      Book {formatPct(bet.impliedProb)}
                      {bet.estProb !== undefined && <> · Est {formatPct(bet.estProb)}</>} · <span className="underline">Why?</span>
                    </>
                  }
                >
                  <WhyList why={bet.why ?? []} />
                </Sheet>
              )}
            </div>
          );
        })}
      </div>
      {m && m.sides[0].all.length > 1 && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-xs text-muted [&::-webkit-details-marker]:hidden">
            Compare {m.sides[0].all.length} books ›
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {m.sides.map((s, i) => (
              <ul key={i} className="divide-y divide-line rounded-xl bg-black/30 text-sm">
                {s.all.map((p, j) => (
                  <li key={p.bookKey} className="flex justify-between gap-2 px-3 py-2">
                    <span className={`truncate ${j === 0 ? "text-good" : "text-muted"}`}>{p.book}</span>
                    <span className="tabular-nums">{formatAmerican(p.american)}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ModelSheet({ d }: { d: GameDetail }) {
  const m = d.model;
  if (!m) return null;
  const g = d.game;
  return (
    <Sheet id="model-sheet" title="How we estimate this game" trigger="Our math" triggerClassName="text-xs text-muted underline">
      <div className="space-y-3">
        <p>Expected margin for {g.home.abbr} (home), in points:</p>
        <ul className="space-y-1 rounded-xl bg-black/30 p-3 font-mono text-[13px] text-fg">
          {m.parts.map((p) => (
            <li key={p.label} className="flex justify-between gap-3">
              <span className="text-muted">{p.label}</span>
              <span>{signed(p.points)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-line pt-1">
            <span>{g.home.abbr} margin</span>
            <span>{signed(m.homeMargin)}</span>
          </li>
        </ul>
        <p>
          A {signed(m.homeMargin)} margin with a typical 12-point spread of outcomes gives {g.home.abbr}{" "}
          <span className="text-fg">{formatPct(m.homeWin, 1)}</span> to win.
          {m.expectedTotal !== undefined && (
            <>
              {" "}
              Expected total: <span className="text-fg">{m.expectedTotal.toFixed(1)}</span> points.
            </>
          )}
        </p>
        <p className="text-xs text-faint">
          Then each estimate is blended with the market before comparing to the price. Tap &ldquo;How?&rdquo; on the
          bets card for that step.
        </p>
      </div>
    </Sheet>
  );
}

/* ---------- Team sections ---------- */

function TeamLine({ t, children }: { t: TeamDetail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Logo src={t.team.logo} size={24} />
      <span className="w-10 font-semibold">{t.team.abbr}</span>
      <div className="min-w-0 flex-1 text-sm text-muted">{children}</div>
    </div>
  );
}

function Last10({ t }: { t: TeamDetail }) {
  const games = t.outlook.results.slice(-10);
  const f = t.outlook.last10;
  return (
    <div className="py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Logo src={t.team.logo} size={24} />
          <span className="font-semibold">{t.team.abbr}</span>
          <span className="text-sm tabular-nums text-muted">
            {f.wins}-{f.games - f.wins} · {f.avgFor.toFixed(1)} for / {f.avgAgainst.toFixed(1)} against
          </span>
        </div>
        <Sparkline values={games.map((r) => r.pointsFor - r.pointsAgainst)} width={80} height={28} />
      </div>
      {games.length === 0 ? (
        <p className="text-sm text-faint">No data yet</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1 text-sm">
          {[...games].reverse().map((r) => (
            <li key={r.eventId} className="grid grid-cols-[3.5rem_1.25rem_1fr_auto] items-center gap-2 tabular-nums">
              <span className="text-faint">{shortDate(r.date)}</span>
              <span className={r.won ? "text-good" : "text-bad"}>{r.won ? "W" : "L"}</span>
              <span className="text-muted">
                {r.home ? "vs" : "@"} {r.opponentAbbr}
              </span>
              <span>
                {r.pointsFor}-{r.pointsAgainst}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detail({ d }: { d: GameDetail }) {
  const g = d.game;
  const teams = [d.away_, d.home_];
  const edges = Object.values(g.bets).filter((b) => (b.edge ?? 0) >= 0.03).length;
  const fmtSplit = (s: { wins: number; losses: number; avgMargin: number; games: number }) =>
    s.games ? `${s.wins}-${s.losses} (${signed(s.avgMargin)})` : "—";

  return (
    <>
      <header className="mb-5 rounded-2xl border border-line bg-card p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center text-center">
          {[g.away, null, g.home].map((t, i) =>
            t ? (
              <div key={t.id} className="flex flex-col items-center gap-1">
                <Logo src={t.logo} size={52} />
                <p className="text-lg font-semibold">{t.abbr}</p>
                <p className="text-xs tabular-nums text-muted">{t.record ?? ""}</p>
                {g.status.state !== "pre" && t.score !== undefined && (
                  <p className="text-3xl font-bold tabular-nums">{t.score}</p>
                )}
              </div>
            ) : (
              <div key={i} className="px-3 text-sm text-muted">
                {g.status.state === "pre" ? (
                  <>
                    <LocalTime iso={g.startTime} />
                    <p className="text-xs text-faint">{d.venueCity ?? ""}</p>
                  </>
                ) : (
                  g.status.detail
                )}
              </div>
            ),
          )}
        </div>
        {(g.away.tags.length > 0 || g.home.tags.length > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[g.away, g.home].map((t) => (
              <div key={t.id} className={`flex flex-wrap gap-1 ${t === g.home ? "justify-end" : ""}`}>
                {t.tags.map((tag) => (
                  <Tag key={tag.label} tag={tag} />
                ))}
              </div>
            ))}
          </div>
        )}
      </header>

      <section className="mb-4 rounded-2xl border border-line bg-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Quick read</p>
        <ul className="space-y-2">
          {d.quickRead.length ? (
            d.quickRead.map((q) => (
              <li key={q} className="flex gap-2 text-[15px] leading-snug">
                <span className="text-faint">•</span>
                <span>{q}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted">No data yet.</li>
          )}
        </ul>
      </section>

      <section className="mb-4 space-y-5 rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">
            Bets{" "}
            {edges > 0 && (
              <span className="ml-1 text-sm font-medium text-good">
                {edges} with an edge
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <ModelSheet d={d} />
            <HowEdgesWork id="how-edge-detail" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          {([0, 1] as const).map((i) => (
            <div key={i}>
              <p className="text-xs text-faint">{i ? g.home.abbr : g.away.abbr} win %</p>
              <WinPct game={g} idx={i} className="text-center" />
            </div>
          ))}
        </div>
        <BetRow game={g} kind="moneyline" title="Moneyline" />
        <BetRow game={g} kind="spread" title="Spread" />
        <BetRow game={g} kind="total" title="Total" />
        <p className="text-[10px] text-faint">
          Odds: {g.oddsSource?.name ?? "no data yet"}
          {g.bpiHomeWin !== undefined && ` · ESPN BPI: ${g.home.abbr} ${formatPct(g.bpiHomeWin)}`}
        </p>
      </section>

      <div className="space-y-3">
        <Section
          title="Injuries"
          summary={teams
            .map((t) => `${t.team.abbr} ${t.injuries.filter((i) => /out/i.test(i.status)).length} out`)
            .join(" · ")}
          source={d.sources.injuries}
        >
          {teams.map((t) => (
            <div key={t.team.id} className="py-2">
              <p className="mb-1 font-semibold">{t.team.abbr}</p>
              {t.injuries.length === 0 ? (
                <p className="text-sm text-faint">No injuries reported</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {t.injuries.map((i) => (
                    <li key={i.name} className="flex justify-between gap-3">
                      <span className="truncate">
                        {i.name}
                        {t.outlook.keyInjuries.some((k) => k.name === i.name) && (
                          <span className="ml-1 text-xs text-faint">key</span>
                        )}
                      </span>
                      <span className={/out/i.test(i.status) ? "text-bad" : "text-muted"}>{i.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>

        <Section
          title="Rest & travel"
          summary={teams.map((t) => `${t.team.abbr} ${restLabel(t.outlook).toLowerCase()}`).join(" · ")}
          source="ESPN schedules"
        >
          {teams.map((t) => {
            const lg = t.outlook.lastGame;
            return (
              <TeamLine key={t.team.id} t={t}>
                <span className="text-fg">{restLabel(t.outlook)}</span>
                {t.outlook.threeInFour && <span className="text-bad"> · 3+ games in 4 nights</span>}
                {lg && (
                  <span className="block">
                    Last: {weekday(lg.date)} {lg.home ? "vs" : "@"} {lg.opponentAbbr}
                    {lg.city ? ` in ${lg.city}` : ""} ({lg.won ? "W" : "L"} {lg.pointsFor}-{lg.pointsAgainst})
                    {d.venueCity && lg.city && lg.city !== d.venueCity ? ` → traveling to ${d.venueCity}` : ""}
                  </span>
                )}
              </TeamLine>
            );
          })}
        </Section>

        <Section
          title="Last 10 games"
          summary={teams.map((t) => `${t.team.abbr} ${t.outlook.last10.wins}-${t.outlook.last10.games - t.outlook.last10.wins}`).join(" · ")}
          source="ESPN schedules (includes last season when needed)"
        >
          {teams.map((t) => (
            <Last10 key={t.team.id} t={t} />
          ))}
        </Section>

        <Section
          title="Head-to-head"
          summary={
            d.h2h.length
              ? `${g.home.abbr} ${d.h2h.filter((r) => r.won).length}-${d.h2h.filter((r) => !r.won).length} in last ${d.h2h.length}`
              : "No data yet"
          }
          source="ESPN schedules, last 4 seasons"
        >
          {d.h2h.length === 0 ? (
            <p className="text-sm text-faint">No recent meetings found.</p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              {d.h2h.map((r) => (
                <li key={r.eventId} className="grid grid-cols-[4.5rem_1.25rem_1fr_auto] items-center gap-2">
                  <span className="text-faint">
                    {new Date(r.date).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "America/New_York" })}
                  </span>
                  <span className={r.won ? "text-good" : "text-bad"}>{r.won ? "W" : "L"}</span>
                  <span className="text-muted">
                    {g.home.abbr} {r.home ? "vs" : "@"} {g.away.abbr}
                  </span>
                  <span>
                    {r.pointsFor}-{r.pointsAgainst}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Home / away splits"
          summary={`${g.away.abbr} away ${fmtSplit(d.away_.splits[0]?.road ?? { wins: 0, losses: 0, avgMargin: 0, games: 0 })} · ${g.home.abbr} home ${fmtSplit(d.home_.splits[0]?.home ?? { wins: 0, losses: 0, avgMargin: 0, games: 0 })}`}
          source="ESPN schedules. (+/−) is average point margin."
        >
          {teams.map((t) => (
            <div key={t.team.id} className="py-2">
              <p className="mb-1 font-semibold">{t.team.abbr}</p>
              {t.splits.length === 0 ? (
                <p className="text-sm text-faint">No data yet</p>
              ) : (
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-xs text-faint">
                    <tr>
                      <th className="text-left font-normal">Season</th>
                      <th className="text-right font-normal">Home</th>
                      <th className="text-right font-normal">Away</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.splits.map((s) => (
                      <tr key={s.season}>
                        <td className="text-muted">{s.season}</td>
                        <td className="text-right">{fmtSplit(s.home)}</td>
                        <td className="text-right">{fmtSplit(s.road)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </Section>

        <Section
          title="Pace & ratings"
          summary={teams
            .map((t) => `${t.team.abbr} pace ${t.ratings?.pace ? t.ratings.pace.toFixed(1) : "—"}`)
            .join(" · ")}
          source="Estimated from ESPN team stats: possessions ≈ FGA − OREB + TOV + 0.44×FTA; ratings are points per 100 possessions."
        >
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-faint">
              <tr>
                <th className="text-left font-normal">Team</th>
                <th className="text-right font-normal">Pace</th>
                <th className="text-right font-normal">Off rtg</th>
                <th className="text-right font-normal">Def rtg</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.team.id}>
                  <td>
                    {t.team.abbr} <span className="text-xs text-faint">{t.ratings ? `${t.ratings.games} gp` : ""}</span>
                  </td>
                  <td className="text-right">{t.ratings?.pace?.toFixed(1) ?? "—"}</td>
                  <td className="text-right">{t.ratings?.offRating?.toFixed(1) ?? "—"}</td>
                  <td className="text-right">{t.ratings?.defRating?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-faint">Lower defensive rating is better. Early-season samples are small.</p>
        </Section>
      </div>
    </>
  );
}

async function GameDetailView({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const d = await getGameDetail(id);
  if (!d) {
    return <p className="mt-10 text-center text-muted">No data yet for this game.</p>;
  }
  return <Detail d={d} />;
}

export default function GamePage({ params }: PageProps<"/game/[id]">) {
  return (
    <main className="pt-5">
      <Link href="/" className="mb-4 inline-block py-1 text-sm text-muted">
        ‹ Games
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-card" />}>
        <GameDetailView params={params} />
      </Suspense>
    </main>
  );
}
