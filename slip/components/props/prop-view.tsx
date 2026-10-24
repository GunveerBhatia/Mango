"use client";

import { useState } from "react";
import { EDGE_THRESHOLD, PROP_LABELS, PROP_SHORT, blend, modelProp, propSample, statValue, type PropStat } from "@/lib/model";
import { formatAmerican, formatPct, impliedProbability, parseAmerican } from "@/lib/odds-math";
import type { PlayerPropsData } from "@/lib/props";
import type { Leg } from "@/lib/slip/types";
import { BetButton } from "../slip/bet-button";

const STATS: PropStat[] = ["pts", "reb", "ast", "pra", "threes"];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function BarChart({
  values,
  labels,
  line,
  faded = [],
}: {
  values: number[];
  labels: string[];
  line?: number;
  /** Bars to dim, e.g. games with a previous team. */
  faded?: boolean[];
}) {
  if (values.length === 0) return <p className="py-8 text-center text-sm text-faint">No data yet</p>;
  const w = 340;
  const h = 150;
  const top = 18;
  const bottom = 20;
  const max = Math.max(...values, line ?? 0, 1) * 1.1;
  const bw = w / values.length;
  const y = (v: number) => top + (h - top - bottom) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Last games bar chart">
      {values.map((v, i) => {
        const over = line !== undefined && v > line;
        const color = line === undefined ? "var(--muted)" : over ? "var(--good)" : "var(--bad)";
        return (
          <g key={i}>
            <rect x={i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={Math.max(1, h - bottom - y(v))} rx={4} fill={color} opacity={faded[i] ? 0.3 : 0.85} />
            <text x={i * bw + bw / 2} y={y(v) - 5} textAnchor="middle" fontSize={11} fill="var(--fg)" fontWeight={600}>
              {v}
            </text>
            <text x={i * bw + bw / 2} y={h - 5} textAnchor="middle" fontSize={9.5} fill="var(--faint)">
              {labels[i]}
            </text>
          </g>
        );
      })}
      {line !== undefined && (
        <>
          <line x1={0} x2={w} y1={y(line)} y2={y(line)} stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="5 4" />
        </>
      )}
    </svg>
  );
}

function HitRate({ label, hits, total }: { label: string; hits: number; total: number }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <p className="text-xs text-muted">{label}</p>
      {total === 0 ? (
        <p className="mt-1 text-sm text-faint">No data yet</p>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums">
            {hits}
            <span className="text-base text-muted">/{total}</span>
          </p>
          <p className="text-[11px] tabular-nums text-muted">{Math.round((hits / total) * 100)}% over</p>
        </>
      )}
    </div>
  );
}

export function PropView({ data, initialStat }: { data: PlayerPropsData; initialStat: PropStat }) {
  const [stat, setStat] = useState<PropStat>(initialStat);
  const [customLine, setCustomLine] = useState("");
  const [customOdds, setCustomOdds] = useState("-110");

  const market = data.markets[stat];
  const bookLine = market?.sides[0].point;
  const typed = Number(customLine);
  const line = customLine !== "" && Number.isFinite(typed) ? typed : bookLine;
  const usingBook = line !== undefined && line === bookLine && market !== undefined;

  const g = data.game;
  const sample = propSample(data.games, data.athlete.teamId, data.athlete.teamAbbr);
  const last10 = sample.games.slice(-10);
  const vals = last10.map((x) => statValue(x, stat));
  const hits = (gs: typeof data.games) => (line === undefined ? 0 : gs.filter((x) => statValue(x, stat) > line).length);
  const current = (x: (typeof data.games)[number]) => !data.athlete.teamId || x.teamId === data.athlete.teamId;
  // Matchup history only counts with his current team; an old team's games vs this opponent say little.
  const vsOpp = g ? data.games.filter((x) => x.opponentId === g.opponentId && current(x)) : [];
  const vsOppOld = g ? data.games.filter((x) => x.opponentId === g.opponentId && !current(x)) : [];
  const venue = g ? sample.games.filter((x) => x.home === g.home).slice(-10) : [];

  const minutes = last10.map((x) => x.min);
  const min3 = mean(minutes.slice(-3));
  const min10 = mean(minutes);
  const dropping = minutes.length >= 5 && min3 < min10 * 0.85;

  const model = line !== undefined ? modelProp(sample.games, stat, line) : null;

  function sideOption(idx: 0 | 1) {
    if (line === undefined || !g || g.started) return { leg: undefined as Leg | undefined, edge: undefined as number | undefined, price: undefined as number | undefined };
    const side = usingBook ? market!.sides[idx] : undefined;
    const american = side ? side.best.american : parseAmerican(customOdds);
    if (american === undefined) return { leg: undefined, edge: undefined, price: undefined };
    const implied = impliedProbability(american);
    const raw = model ? (idx === 0 ? model.overProb : 1 - model.overProb) : undefined;
    // Edges need a real market to compare against; a typed-in line only gets the model's number.
    const est = raw === undefined || !side ? undefined : blend(raw, side.fairProb);
    const word = idx === 0 ? "Over" : "Under";
    const leg: Leg = {
      id: `${g.id}:prop:${data.athlete.id}:${stat}:${idx === 0 ? "over" : "under"}`,
      kind: "prop",
      league: "nba",
      gameId: g.id,
      startTime: g.startTime,
      matchup: g.matchup,
      label: `${data.athlete.name} ${word} ${line} ${PROP_SHORT[stat]}`,
      side: idx,
      teamId: data.athlete.teamId,
      american,
      book: side ? side.best.book : "Your line",
      point: line,
      impliedProb: implied,
      fairProb: side?.fairProb,
      estProb: est,
      athleteId: data.athlete.id,
      athleteName: data.athlete.name,
      stat,
    };
    return { leg, edge: est === undefined ? undefined : est - implied, price: american };
  }
  const over = sideOption(0);
  const under = sideOption(1);

  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStat(s);
              setCustomLine("");
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${s === stat ? "bg-fg text-bg" : "bg-card text-muted"}`}
          >
            {PROP_SHORT[s]}
          </button>
        ))}
      </div>

      {sample.note && (
        <p className="mb-4 rounded-2xl border border-line bg-card p-3 text-sm text-muted">
          <span className="font-medium text-fg">Traded. </span>
          {sample.note}
        </p>
      )}

      <section className="mb-4 rounded-2xl border border-line bg-card p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">{PROP_LABELS[stat]} line</p>
            <p className="text-4xl font-bold tabular-nums">{line ?? "—"}</p>
            <p className="text-[11px] text-faint">
              {usingBook ? `Best: ${market!.sides[0].best.book} · ${market!.sides[0].all.length} books` : line !== undefined ? "Your line" : data.oddsNote}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Last 10 avg</p>
            <p className="text-2xl font-semibold tabular-nums">{vals.length ? mean(vals).toFixed(1) : "—"}</p>
            {model && (
              <p className="text-[11px] tabular-nums text-muted">Model over: {formatPct(model.overProb)}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-2">
          <input
            inputMode="decimal"
            value={customLine}
            onChange={(e) => setCustomLine(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={bookLine !== undefined ? `Try another line (book: ${bookLine})` : "Enter a line, e.g. 18.5"}
            className="rounded-xl bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-faint"
          />
          {!usingBook && line !== undefined && (
            <input
              value={customOdds}
              onChange={(e) => setCustomOdds(e.target.value)}
              aria-label="Your odds"
              className="w-20 rounded-xl bg-black/30 px-3 py-2.5 text-center text-sm tabular-nums outline-none"
            />
          )}
        </div>

        {g && !g.started && line !== undefined && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <BetButton leg={over.leg} main={`Over ${formatAmerican(over.price)}`} edge={over.edge} />
            <BetButton leg={under.leg} main={`Under ${formatAmerican(under.price)}`} edge={under.edge} />
          </div>
        )}
        {!usingBook && line !== undefined && (
          <p className="mt-2 text-xs text-muted">
            Edges are only shown against a real sportsbook line. Your line is for research.
          </p>
        )}
        {usingBook && (over.edge ?? 0) < EDGE_THRESHOLD && (under.edge ?? 0) < EDGE_THRESHOLD && model && (
          <p className="mt-2 text-xs text-muted">No edge of {EDGE_THRESHOLD * 100}%+ on either side at this price.</p>
        )}
      </section>

      <section className="mb-4 rounded-2xl border border-line bg-card p-4">
        <p className="mb-1 font-semibold">Last {last10.length} games</p>
        <p className="mb-3 text-sm text-muted">
          {line !== undefined && vals.length > 0 ? `Over in ${hits(last10)} of last ${last10.length}` : "Set a line to see hits"}
        </p>
        <BarChart
          values={vals}
          labels={last10.map((x) => `${x.home ? "" : "@"}${x.opponentAbbr}`)}
          line={line}
          faded={last10.map((x) => !current(x))}
        />
        {last10.some((x) => !current(x)) && (
          <p className="mt-1 text-[11px] text-faint">Faded bars: games with his previous team.</p>
        )}
      </section>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <HitRate label="Last 10" hits={hits(last10)} total={line === undefined ? 0 : last10.length} />
        <HitRate
          label={g ? `vs ${g.opponentAbbr}${vsOppOld.length ? ` (${data.athlete.teamAbbr})` : ""}` : "vs opponent"}
          hits={hits(vsOpp)}
          total={line === undefined ? 0 : vsOpp.length}
        />
        <HitRate label={g ? (g.home ? "Home" : "Away") : "Venue"} hits={hits(venue)} total={line === undefined ? 0 : venue.length} />
      </div>

      {line !== undefined && vsOppOld.length > 0 && g && (
        <p className="-mt-2 mb-4 px-1 text-[11px] text-faint">
          Left out: {hits(vsOppOld)}/{vsOppOld.length} over vs {g.opponentAbbr} with his old team.
        </p>
      )}

      <section className="mb-4 rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Minutes</p>
          <p className={`text-sm tabular-nums ${dropping ? "text-bad" : "text-muted"}`}>
            {minutes.length ? `${min3.toFixed(1)} last 3 · ${min10.toFixed(1)} last 10` : "No data yet"}
          </p>
        </div>
        {dropping && (
          <p className="mt-2 text-sm text-bad">
            Minutes are dropping. Fewer minutes usually means fewer stats — the model scales down for this.
          </p>
        )}
        {minutes.length > 0 && (
          <div className="mt-3 flex h-12 items-end gap-1">
            {minutes.map((m, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-white/15"
                style={{ height: `${Math.max(4, (m / Math.max(...minutes, 1)) * 100)}%` }}
                title={`${m} min`}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-faint">
        Game logs: ESPN (regular season, this season and last). {data.oddsNote.startsWith("Lines") ? data.oddsNote + "." : ""} Model:
        last-10 average and spread (normal approximation), scaled for dropping minutes, blended 30/70 with the
        market when a book line exists.
      </p>
    </>
  );
}
