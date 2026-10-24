import { describe, expect, it } from "vitest";
import { modelProp, normCdf, normInv } from "../model";
import { impliedProbability } from "../odds-math";
import {
  evByLeg,
  legClv,
  recordStats,
  slipNumbers,
  slipProfit,
  slipResult,
  slipWarnings,
  stakeAdvice,
  totalEv,
} from "../slip/math";
import { DEFAULT_SETTINGS, type Leg, type SavedSlip } from "../slip/types";

const leg = (over: Partial<Leg>): Leg => ({
  id: Math.random().toString(),
  kind: "moneyline",
  league: "nba",
  gameId: "1",
  startTime: "2026-10-24T22:00:00Z",
  matchup: "MIA @ CHA",
  label: "MIA ML",
  side: 0,
  teamId: "14",
  american: -110,
  book: "DK",
  impliedProb: impliedProbability(-110),
  fairProb: 0.5,
  ...over,
});

describe("slip numbers", () => {
  it("multiplies odds and probabilities", () => {
    const n = slipNumbers([leg({}), leg({ gameId: "2" })]);
    expect(n.decimal).toBeCloseTo(3.645, 3);
    expect(n.american).toBe(264);
    expect(n.impliedHit).toBeCloseTo(0.2744, 3);
  });

  it("shows each leg costing EV at fair coin-flip odds", () => {
    const legs = [leg({}), leg({ gameId: "2" }), leg({ gameId: "3" })];
    const evs = evByLeg(legs, 100);
    expect(evs.every((e) => e < 0)).toBe(true);
    expect(evs.reduce((a, b) => a + b, 0)).toBeCloseTo(totalEv(legs, 100), 6);
    // Each extra -110 leg compounds the cut.
    expect(totalEv(legs, 100)).toBeLessThan(totalEv(legs.slice(0, 2), 100));
  });
});

describe("stake advice", () => {
  it("suggests a flat % and caps at 5%", () => {
    const a = stakeAdvice({ ...DEFAULT_SETTINGS, bankroll: 1000, flatPct: 2 }, [leg({})])!;
    expect(a.suggested).toBe(20);
    expect(a.max).toBe(50);
  });
  it("Kelly says $0 with no edge and caps big edges", () => {
    const s = { ...DEFAULT_SETTINGS, bankroll: 1000, stakeMode: "kelly" as const };
    expect(stakeAdvice(s, [leg({ estProb: 0.5 })])!.suggested).toBe(0);
    expect(stakeAdvice(s, [leg({ american: 100, estProb: 0.9 })])!.suggested).toBe(50);
  });
});

describe("warnings", () => {
  it("flags contradictions, same-team ML+spread and low hit rates", () => {
    const w = slipWarnings(
      [
        leg({ kind: "moneyline", side: 0, teamId: "14" }),
        leg({ kind: "spread", side: 0, teamId: "14", label: "MIA -4.5" }),
        leg({ kind: "moneyline", side: 1, teamId: "30", label: "CHA ML" }),
      ],
      DEFAULT_SETTINGS,
    ).join(" ");
    expect(w).toMatch(/against each other/);
    expect(w).toMatch(/same team/);
    expect(w).toMatch(/less than 1 in 4/);
  });
});

describe("results", () => {
  const slip = (legs: Partial<SavedSlip["legs"][number]>[]): SavedSlip => ({
    id: "s",
    createdAt: "",
    stake: 10,
    decimalAtSave: 1,
    unitSize: 10,
    legs: legs.map((l) => ({ ...leg({}), result: "pending", ...l })),
  });

  it("drops pushed legs from a parlay", () => {
    const s = slip([{ result: "won", american: 100 }, { result: "push" }]);
    expect(slipResult(s)).toBe("won");
    expect(slipProfit(s)).toBe(10);
  });
  it("any lost leg loses the slip", () => {
    expect(slipProfit(slip([{ result: "won" }, { result: "lost" }]))).toBe(-10);
  });
  it("computes record and CLV", () => {
    const st = recordStats([
      slip([{ result: "won", american: 100, closingAmerican: -120 }]),
      slip([{ result: "lost", kind: "spread", point: 4.5, closingPoint: 3.5, closingAmerican: -110 }]),
    ]);
    expect(st.profit).toBe(0);
    expect(st.winRate).toBe(0.5);
    expect(st.units).toBe(0);
    expect(st.clv.count).toBe(2);
    expect(st.clv.beatRate).toBe(1);
    expect(legClv({ ...leg({ american: 100 }), result: "won", closingAmerican: -120 })).toBeCloseTo(0.0455, 3);
  });
});

describe("model", () => {
  it("normal helpers are inverses", () => {
    expect(normCdf(0)).toBeCloseTo(0.5);
    expect(normCdf(normInv(0.8))).toBeCloseTo(0.8, 4);
  });
  it("prop model needs 5 games and scales for dropping minutes", () => {
    const g = (pts: number, min: number) => ({
      eventId: "", date: "", home: true, opponentId: "", opponentAbbr: "", min, pts, reb: 0, ast: 0, threes: 0,
    });
    expect(modelProp([g(20, 30)], "pts", 19.5)).toBeNull();
    const steady = modelProp(Array.from({ length: 10 }, () => g(20, 32)), "pts", 19.5)!;
    expect(steady.overProb).toBeGreaterThan(0.5);
    const dropping = modelProp([...Array.from({ length: 7 }, () => g(20, 34)), g(20, 20), g(20, 20), g(20, 20)], "pts", 19.5)!;
    expect(dropping.minutesFactor).toBeLessThan(1);
    expect(dropping.overProb).toBeLessThan(steady.overProb);
  });
});
