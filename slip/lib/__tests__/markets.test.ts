import { describe, expect, it } from "vitest";
import { buildMarket } from "../markets";
import { americanToDecimal, impliedProbability, removeVig } from "../odds-math";
import { findEvent, quotesForEvent, type OddsEvent } from "../providers/odds-api";

const event: OddsEvent = {
  id: "x",
  commence_time: "2026-10-24T22:00:00Z",
  away_team: "Miami Heat",
  home_team: "Charlotte Hornets",
  bookmakers: [
    {
      key: "draftkings",
      title: "DraftKings",
      last_update: "",
      markets: [
        { key: "h2h", outcomes: [{ name: "Miami Heat", price: -162 }, { name: "Charlotte Hornets", price: 136 }] },
        { key: "spreads", outcomes: [{ name: "Miami Heat", price: -105, point: -4.5 }, { name: "Charlotte Hornets", price: -115, point: 4.5 }] },
        { key: "totals", outcomes: [{ name: "Over", price: -105, point: 228.5 }, { name: "Under", price: -115, point: 228.5 }] },
      ],
    },
    {
      key: "fanduel",
      title: "FanDuel",
      last_update: "",
      markets: [
        { key: "h2h", outcomes: [{ name: "Miami Heat", price: -155 }, { name: "Charlotte Hornets", price: 130 }] },
        { key: "spreads", outcomes: [{ name: "Miami Heat", price: -110, point: -4.5 }, { name: "Charlotte Hornets", price: -110, point: 4.5 }] },
      ],
    },
    {
      key: "betmgm",
      title: "BetMGM",
      last_update: "",
      markets: [
        { key: "spreads", outcomes: [{ name: "Miami Heat", price: 100, point: -5.5 }, { name: "Charlotte Hornets", price: -120, point: 5.5 }] },
      ],
    },
  ],
};

describe("odds math", () => {
  it("converts American odds", () => {
    expect(impliedProbability(-150)).toBeCloseTo(0.6);
    expect(impliedProbability(150)).toBeCloseTo(0.4);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5);
    const [a, b, vig] = removeVig(-110, -110);
    expect(a).toBeCloseTo(0.5);
    expect(b).toBeCloseTo(0.5);
    expect(vig).toBeCloseTo(0.0476, 3);
  });
});

describe("line shopping", () => {
  const q = quotesForEvent(event);

  it("picks the best price per side across books", () => {
    const ml = buildMarket("moneyline", ["MIA", "CHA"], q.moneyline)!;
    expect(ml.sides[0].best).toMatchObject({ book: "FanDuel", american: -155 });
    expect(ml.sides[1].best).toMatchObject({ book: "DraftKings", american: 136 });
    expect(ml.sides[0].fairProb! + ml.sides[1].fairProb!).toBeCloseTo(1);
  });

  it("only compares prices at the most common line", () => {
    const sp = buildMarket("spread", ["MIA", "CHA"], q.spread)!;
    expect(sp.sides[0].point).toBe(-4.5);
    expect(sp.sides[0].all.map((p) => p.book)).toEqual(["DraftKings", "FanDuel"]);
  });

  it("matches events by nickname and time", () => {
    expect(findEvent([event], "Heat", "Hornets", "2026-10-24T22:00Z")).toBe(event);
    expect(findEvent([event], "Hornets", "Heat", "2026-10-24T22:00Z")).toBeUndefined();
  });
});
