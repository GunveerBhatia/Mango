"use client";

import { useEffect, useRef, useState } from "react";
import { decimalToAmerican, formatAmerican, formatPct, parseAmerican } from "@/lib/odds-math";
import { legClv, money, recordStats, slipCategory, slipProfit, slipResult } from "@/lib/slip/math";
import { slipActions, useSlip } from "@/lib/slip/store";
import type { LegResult, SavedSlip, Settings } from "@/lib/slip/types";

const CATEGORY_LABEL = { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Prop", parlay: "Parlay" };
const RESULT_STYLE: Record<LegResult, string> = {
  pending: "bg-white/5 text-muted",
  won: "bg-good/15 text-good",
  lost: "bg-bad/15 text-bad",
  push: "bg-white/10 text-fg",
};
const NEXT: Record<LegResult, LegResult> = { pending: "won", won: "lost", lost: "push", push: "pending" };
const pctSigned = (x: number) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const tone = (x: number | undefined) => (x === undefined || x === 0 ? "" : x > 0 ? "text-good" : "text-bad");

/* ---------- Auto-check results ---------- */

async function checkResults(slips: SavedSlip[]) {
  const legs = slips
    .flatMap((s) => s.legs.map((l) => ({ s, l })))
    .filter(({ l }) => (l.result === "pending" || l.closingAmerican === undefined) && Date.parse(l.startTime) < Date.now());
  if (legs.length === 0) return 0;
  const res = await fetch("/api/settle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ legs: legs.map(({ l }) => l) }),
  });
  if (!res.ok) throw new Error("settle failed");
  const data: { legs: { id: string; result?: LegResult; actual?: number; closingAmerican?: number; closingPoint?: number }[] } =
    await res.json();
  let updated = 0;
  for (const { s, l } of legs) {
    const r = data.legs.find((x) => x.id === l.id);
    if (!r) continue;
    const patch: Parameters<typeof slipActions.updateLeg>[2] = {};
    if (l.result === "pending" && r.result) patch.result = r.result;
    if (r.actual !== undefined) patch.actual = r.actual;
    if (l.closingAmerican === undefined && r.closingAmerican !== undefined) {
      patch.closingAmerican = r.closingAmerican;
      patch.closingPoint = r.closingPoint;
    }
    if (Object.keys(patch).length) {
      slipActions.updateLeg(s.id, l.id, patch);
      updated++;
    }
  }
  return updated;
}

/* ---------- Pieces ---------- */

function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${className}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function SettingsCard({ settings }: { settings: Settings }) {
  const [text, setText] = useState(settings.bankroll ? String(settings.bankroll) : "");
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? "bg-fg text-bg font-medium" : "bg-white/5 text-muted"}`;
  return (
    <details className="group rounded-2xl border border-line bg-card" open={!settings.bankroll}>
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="font-semibold">Bankroll & settings</p>
          <p className="text-sm text-muted">
            {settings.bankroll
              ? `${money(settings.bankroll)} · ${settings.stakeMode === "flat" ? `${settings.flatPct}% flat` : "¼ Kelly"} · max ${settings.maxLegs} legs`
              : "Set your bankroll to get stake suggestions"}
          </p>
        </div>
        <span className="text-faint transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-4 border-t border-line p-4">
        <label className="block">
          <span className="text-xs text-muted">Total bankroll (money set aside for betting only)</span>
          <div className="mt-1 flex items-center rounded-xl bg-black/30 px-3">
            <span className="text-muted">$</span>
            <input
              inputMode="decimal"
              value={text}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                setText(v);
                const n = Number(v);
                slipActions.updateSettings({ bankroll: n > 0 ? n : undefined });
              }}
              placeholder="1000"
              className="w-full bg-transparent px-1 py-3 text-lg font-semibold tabular-nums outline-none"
            />
          </div>
        </label>
        <div>
          <p className="mb-2 text-xs text-muted">Suggested stake</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                type="button"
                className={chip(settings.stakeMode === "flat" && settings.flatPct === p)}
                onClick={() => slipActions.updateSettings({ stakeMode: "flat", flatPct: p })}
              >
                {p}% flat
              </button>
            ))}
            <button
              type="button"
              className={chip(settings.stakeMode === "kelly")}
              onClick={() => slipActions.updateSettings({ stakeMode: "kelly", kellyFraction: 0.25 })}
            >
              ¼ Kelly
            </button>
          </div>
          <p className="mt-2 text-xs text-faint">
            ¼ Kelly sizes bets by our estimated edge (and says $0 when there&apos;s none). Any slip is capped at 5% of
            your bankroll.
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted">Max legs per slip</p>
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4, 6].map((n) => (
              <button
                key={n}
                type="button"
                className={chip(settings.maxLegs === n)}
                onClick={() => slipActions.updateSettings({ maxLegs: n })}
              >
                {n}
                {n > 4 ? " (not advised)" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function SlipCard({ s }: { s: SavedSlip }) {
  const r = slipResult(s);
  const profit = slipProfit(s);
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          {new Date(s.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} ·{" "}
          {CATEGORY_LABEL[slipCategory(s)]} · {money(s.stake)} at {formatAmerican(decimalToAmerican(s.decimalAtSave))}
        </p>
        <p className={`font-semibold tabular-nums ${r === "pending" ? "text-muted" : tone(profit)}`}>
          {r === "pending" ? "Pending" : r === "push" ? "Push" : money(profit, true)}
        </p>
      </div>
      <ul className="space-y-3">
        {s.legs.map((l) => {
          const clv = legClv(l);
          return (
            <li key={l.id} className="grid grid-cols-[1fr_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.label}</p>
                <p className="text-xs tabular-nums text-muted">
                  {formatAmerican(l.american)} {l.book}
                  {l.actual !== undefined && ` · final ${l.actual}`}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs tabular-nums">
                  <span className="text-faint">Close</span>
                  <input
                    defaultValue={l.closingAmerican !== undefined ? formatAmerican(l.closingAmerican) : ""}
                    key={l.closingAmerican ?? "none"}
                    placeholder="odds"
                    inputMode="text"
                    aria-label="Closing odds"
                    onBlur={(e) => {
                      const v = parseAmerican(e.target.value);
                      slipActions.updateLeg(s.id, l.id, { closingAmerican: v });
                    }}
                    className="w-16 rounded-md bg-black/30 px-2 py-1 text-fg outline-none placeholder:text-faint"
                  />
                  {l.closingPoint !== undefined && l.closingPoint !== l.point && (
                    <span className="text-faint">line {l.closingPoint}</span>
                  )}
                  {clv !== undefined && <span className={tone(clv)}>CLV {pctSigned(clv)}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => slipActions.updateLeg(s.id, l.id, { result: NEXT[l.result] })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${RESULT_STYLE[l.result]}`}
                aria-label={`Result: ${l.result}. Tap to change.`}
              >
                {l.result}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete this slip from your record?")) slipActions.deleteSlip(s.id);
          }}
          className="text-xs text-faint"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

/* ---------- Page ---------- */

export function RecordView() {
  const { saved, settings, ready } = useSlip();
  const [status, setStatus] = useState<string>();
  const autoChecked = useRef(false);
  const st = recordStats(saved);

  async function runCheck() {
    setStatus("Checking…");
    try {
      const n = await checkResults(saved);
      setStatus(n ? `Updated ${n} ${n === 1 ? "leg" : "legs"}.` : "Nothing new yet.");
    } catch {
      setStatus("Couldn't reach ESPN. Try again later, or mark results by hand.");
    }
  }

  useEffect(() => {
    if (autoChecked.current || saved.length === 0) return;
    autoChecked.current = true;
    checkResults(saved).catch(() => {});
  }, [saved]);

  if (!ready) return <div className="h-40 animate-pulse rounded-2xl border border-line bg-card" />;

  const worst = st.byCategory.filter((c) => c.bets >= 5 && c.roi < 0).sort((a, b) => a.roi - b.roi)[0];
  const legTypes = [...st.legTypes].sort((a, b) => b.hitRate - b.expected - (a.hitRate - a.expected));

  return (
    <div className="space-y-4">
      <SettingsCard settings={settings} />

      {saved.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="font-semibold">No slips yet</p>
          <p className="mt-1 text-sm text-muted">Tap prices on the Games or Props tabs, then save your slip.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Profit"
              value={money(st.profit, true)}
              className={tone(st.profit)}
              sub={st.units !== undefined ? `${st.units > 0 ? "+" : ""}${st.units} units` : undefined}
            />
            <Stat label="ROI" value={st.roi === undefined ? "—" : pctSigned(st.roi)} className={tone(st.roi)} sub={`on ${money(st.staked)} staked`} />
            <Stat
              label="Win rate"
              value={st.winRate === undefined ? "—" : formatPct(st.winRate)}
              sub={`${st.won}-${st.lost} · ${st.pending} pending`}
            />
            <Stat
              label="Closing line value"
              value={st.clv.avg === undefined ? "—" : pctSigned(st.clv.avg)}
              className={tone(st.clv.avg)}
              sub={st.clv.beatRate === undefined ? "No closing odds yet" : `Beat the close on ${formatPct(st.clv.beatRate)} of ${st.clv.count} bets`}
            />
          </div>

          <p className="px-1 text-xs leading-relaxed text-faint">
            Closing line value is the best early sign a strategy works: if you regularly get better odds than the
            final pre-game price, you&apos;re likely beating the market — even before wins show up. Win rate alone
            swings a lot over small samples.
          </p>

          {st.byCategory.length > 0 && (
            <section className="rounded-2xl border border-line bg-card p-4">
              <p className="mb-3 font-semibold">By bet type</p>
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-faint">
                  <tr>
                    <th className="text-left font-normal">Type</th>
                    <th className="text-right font-normal">W-L</th>
                    <th className="text-right font-normal">Profit</th>
                    <th className="text-right font-normal">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {st.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td className="py-1">{CATEGORY_LABEL[c.category]}</td>
                      <td className="text-right text-muted">
                        {c.won}-{c.lost}
                      </td>
                      <td className={`text-right ${tone(c.profit)}`}>{money(c.profit, true)}</td>
                      <td className={`text-right ${tone(c.roi)}`}>{pctSigned(c.roi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {worst ? (
                <p className="mt-3 text-sm text-bad">
                  {CATEGORY_LABEL[worst.category]} are losing money ({pctSigned(worst.roi)} ROI over {worst.bets} bets).
                  Consider cutting them.
                </p>
              ) : (
                <p className="mt-3 text-xs text-faint">Results under 5 bets per type are mostly noise.</p>
              )}
            </section>
          )}

          {legTypes.length > 0 && (
            <section className="rounded-2xl border border-line bg-card p-4">
              <p className="mb-1 font-semibold">Best and worst leg types</p>
              <p className="mb-3 text-xs text-muted">Hit rate vs. the rate the odds said you needed. Includes parlay legs.</p>
              <ul className="space-y-2 text-sm tabular-nums">
                {legTypes.map((k) => {
                  const diff = k.hitRate - k.expected;
                  return (
                    <li key={k.kind} className="grid grid-cols-[1fr_auto_auto] gap-3">
                      <span>{CATEGORY_LABEL[k.kind]}</span>
                      <span className="text-muted">
                        {k.hit}/{k.legs} hit ({formatPct(k.hitRate)}) · needed {formatPct(k.expected)}
                      </span>
                      <span className={tone(diff)}>{pctSigned(diff)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="flex items-center justify-between px-1">
            <p className="font-semibold">Slips</p>
            <button type="button" onClick={runCheck} className="text-sm text-muted underline">
              Check results
            </button>
          </div>
          {status && <p className="px-1 text-xs text-muted">{status}</p>}
          <p className="px-1 text-xs text-faint">
            Results and closing odds fill in from ESPN after games end (DraftKings close). Tap a result to change it;
            type closing odds for props.
          </p>
          <ul className="space-y-3">
            {saved.map((s) => (
              <SlipCard key={s.id} s={s} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
