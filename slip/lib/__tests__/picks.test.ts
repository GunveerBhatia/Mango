import { describe, expect, it } from "vitest";
import { impliedProbability } from "../odds-math";
import { buildParlays, type PickLeg } from "../picks";
import { riskStake } from "../slip/math";

const c = (gameId: string, american: number, estProb: number): PickLeg => ({
  leg: {
    id: `${gameId}:${american}`,
    kind: "moneyline",
    league: "nba",
    gameId,
    startTime: "",
    matchup: "",
    label: "",
    side: 0,
    american,
    book: "DK",
    impliedProb: impliedProbability(american),
  },
  why: [],
  edge: estProb - impliedProbability(american),
  estProb,
});

// A normal night: no big edges, a mix of favorites and dogs priced near fair.
const night = [
  c("1", -200, 0.66), c("1", 170, 0.36),
  c("2", -150, 0.59), c("2", 130, 0.42),
  c("3", -110, 0.51), c("3", 120, 0.45),
  c("4", 150, 0.39), c("4", -170, 0.61),
  c("5", 200, 0.33), c("5", -240, 0.69),
];

describe("auto parlays", () => {
  const ps = buildParlays(night);
  const byId = Object.fromEntries(ps.map((p) => [p.id, p]));

  it("still offers parlays on a night with no 3% edges", () => {
    expect(byId.value).toBeUndefined();
    expect(byId.steady).toBeDefined();
    expect(byId.longshot).toBeDefined();
  });
  it("uses one leg per game and at most 4 legs", () => {
    for (const p of ps) {
      expect(new Set(p.legs.map((l) => l.leg.gameId)).size).toBe(p.legs.length);
      expect(p.legs.length).toBeLessThanOrEqual(4);
    }
  });
  it("orders risk: steady pays least and hits most, long shot pays 15x+", () => {
    expect(byId.steady.multiplier).toBeLessThan(4);
    expect(byId.longshot.multiplier).toBeGreaterThanOrEqual(15);
    expect(byId.steady.estHit).toBeGreaterThan(byId.longshot.estHit);
  });
  it("builds a value parlay only from real edges", () => {
    const v = buildParlays([c("1", -110, 0.58), c("2", -110, 0.57), c("3", -110, 0.5)]).find((p) => p.id === "value")!;
    expect(v.legs.map((l) => l.leg.gameId)).toEqual(["1", "2"]);
  });
  it("skips legs that are much worse than fair", () => {
    expect(buildParlays([c("1", -300, 0.6), c("2", -300, 0.6)])).toEqual([]);
  });
});

describe("risk-sized stakes", () => {
  it("bets less the less likely it hits", () => {
    expect(riskStake(1000, 0.5)).toBe(25);
    expect(riskStake(1000, 0.025)).toBe(1.5);
    expect(riskStake(100, 0.01)).toBe(1);
  });
});

