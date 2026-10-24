import { describe, expect, it } from "vitest";
import { buildParlays, type PickLeg } from "../picks";

const c = (gameId: string, edge: number, estProb: number, american = -110): PickLeg => ({
  leg: {
    id: `${gameId}:${edge}:${estProb}`,
    kind: "spread",
    league: "nba",
    gameId,
    startTime: "",
    matchup: "",
    label: "",
    side: 0,
    american,
    book: "DK",
    impliedProb: 0.524,
  },
  why: [],
  edge,
  estProb,
});

describe("auto parlays", () => {
  it("builds a value parlay from 3%+ edges, one leg per game", () => {
    const [value] = buildParlays([c("1", 0.06, 0.58), c("1", 0.05, 0.57), c("2", 0.04, 0.56), c("3", 0.01, 0.6)]);
    expect(value.id).toBe("value");
    expect(value.legs.map((l) => l.leg.gameId)).toEqual(["1", "2"]);
  });
  it("never uses legs our estimate rates worse than the price", () => {
    expect(buildParlays([c("1", -0.02, 0.8), c("2", 0, 0.75)])).toEqual([]);
  });
  it("builds a higher-hit parlay from the likeliest positive legs", () => {
    const ps = buildParlays([c("1", 0.015, 0.7, -250), c("2", 0.02, 0.68, -220), c("3", 0.04, 0.55)]);
    expect(ps.map((p) => p.id)).toEqual(["safer"]);
    expect(ps[0].legs.map((l) => l.leg.gameId)).toEqual(["1", "2"]);
  });
});
