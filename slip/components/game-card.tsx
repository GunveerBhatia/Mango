import Image from "next/image";
import { LocalTime } from "./local-time";
import { Sheet } from "./sheet";
import { Tag } from "./tag";
import {
  formatAmerican,
  formatPct,
  formatPoint,
  impliedMath,
  impliedProbability,
  removeVig,
} from "@/lib/odds-math";
import type { Game, Market, MarketSide, TeamSide } from "@/lib/types";

/* ---------- Win % with the math one tap away ---------- */

function pickExampleBook(m: Market) {
  // Show the math with one real book that lists both sides.
  for (const a of m.sides[0].all) {
    const b = m.sides[1].all.find((p) => p.bookKey === a.bookKey);
    if (b) return { book: a.book, a: a.american, b: b.american };
  }
  return null;
}

function WinPct({ game, idx }: { game: Game; idx: 0 | 1 }) {
  const m = game.markets.moneyline;
  const side = m?.sides[idx];
  if (!m || side?.fairProb === undefined) return <span className="text-faint">—</span>;
  const ex = pickExampleBook(m);
  const books = m.sides[0].all.length;
  return (
    <Sheet
      id={`wp-${game.id}-${idx}`}
      title={`Where ${formatPct(side.fairProb)} comes from`}
      triggerClassName="w-full text-right text-xl font-semibold tabular-nums underline decoration-faint decoration-dotted underline-offset-4"
      trigger={formatPct(side.fairProb)}
    >
      {ex ? (
        <div className="space-y-3">
          <p>Moneyline at {ex.book}:</p>
          <div className="space-y-1 rounded-xl bg-black/30 p-3 font-mono text-[13px] text-fg">
            <p>
              {m.sides[0].label} {formatAmerican(ex.a)} → {impliedMath(ex.a)}
            </p>
            <p>
              {m.sides[1].label} {formatAmerican(ex.b)} → {impliedMath(ex.b)}
            </p>
          </div>
          {(() => {
            const pa = impliedProbability(ex.a);
            const pb = impliedProbability(ex.b);
            const [fa, fb, vig] = removeVig(ex.a, ex.b);
            return (
              <p>
                Those add to {formatPct(pa + pb, 1)}. The extra {formatPct(vig, 1)} is the book&apos;s
                cut (the &ldquo;vig&rdquo;). Dividing each side by {formatPct(pa + pb, 1)} removes it:{" "}
                <span className="text-fg">
                  {m.sides[0].label} {formatPct(fa, 1)}, {m.sides[1].label} {formatPct(fb, 1)}
                </span>
                .
              </p>
            );
          })()}
          {books > 1 && (
            <p>
              The number on the card is the vig-free average across {books} books:{" "}
              <span className="text-fg">
                {side.label} {formatPct(side.fairProb, 1)}
              </span>
              .
            </p>
          )}
          <p className="text-xs text-faint">
            This is what the market thinks, not a prediction. Source: {game.oddsSource?.name}.
          </p>
        </div>
      ) : (
        <p>No data yet.</p>
      )}
    </Sheet>
  );
}

/* ---------- A price button (will add to the slip in a later step) ---------- */

function PriceCell({
  game,
  side,
  main,
  sub,
  sheetId,
  sheetTitle,
  signedPoint = true,
}: {
  game: Game;
  side: MarketSide | undefined;
  main: string;
  /** Small second line, e.g. the price under a spread. */
  sub?: string;
  sheetId: string;
  sheetTitle: string;
  signedPoint?: boolean;
}) {
  if (!side) {
    return <div className="flex h-12 items-center justify-center rounded-xl bg-white/[0.03] text-faint">—</div>;
  }
  // With several books, name the one with the best price; tap to see them all.
  const multi = side.all.length > 1;
  const subLine = [sub, multi ? side.best.book : undefined].filter(Boolean).join(" · ");
  const inner = (
    <>
      <span className="text-[15px] font-semibold tabular-nums leading-5">{main}</span>
      {subLine && <span className="max-w-full truncate text-[10px] leading-3 text-muted tabular-nums">{subLine}</span>}
    </>
  );
  const cls =
    "flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl bg-white/5 px-1 active:bg-white/10";
  if (!multi) return <div className={cls}>{inner}</div>;
  return (
    <Sheet id={sheetId} title={sheetTitle} triggerClassName={cls} trigger={inner}>
      <p className="mb-3">Best price first. Same bet, better odds = more money over time.</p>
      <ul className="divide-y divide-line rounded-xl bg-black/30">
        {side.all.map((p, i) => (
          <li key={p.bookKey} className="flex items-center justify-between px-3 py-2.5">
            <span className={i === 0 ? "text-good" : "text-fg"}>{p.book}</span>
            <span className="tabular-nums text-fg">
              {p.point !== undefined && <span className="mr-2 text-muted">{formatPoint(p.point, signedPoint)}</span>}
              {formatAmerican(p.american)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-faint">Source: {game.oddsSource?.name}</p>
    </Sheet>
  );
}

/* ---------- Team row ---------- */

function TeamRow({ game, team, idx }: { game: Game; team: TeamSide; idx: 0 | 1 }) {
  const ml = game.markets.moneyline?.sides[idx];
  const sp = game.markets.spread?.sides[idx];
  const showScore = game.status.state !== "pre" && team.score !== undefined;
  return (
    <div>
    <div className="grid grid-cols-[1fr_3.25rem_4rem_4.5rem] items-center gap-2">
      <div className="flex min-w-0 items-center gap-3">
        {team.logo ? (
          <Image src={team.logo} alt="" width={32} height={32} className="size-8 shrink-0" unoptimized />
        ) : (
          <div className="size-8 shrink-0 rounded-full bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold">{team.abbr}</span>
            {team.record && <span className="text-xs tabular-nums text-muted">{team.record}</span>}
            {showScore && <span className="ml-auto text-base font-semibold tabular-nums">{team.score}</span>}
          </div>
        </div>
      </div>
      <WinPct game={game} idx={idx} />
      <PriceCell
        game={game}
        side={ml}
        main={formatAmerican(ml?.best.american)}
        sheetId={`ml-${game.id}-${idx}`}
        sheetTitle={`${team.abbr} moneyline — every book`}
      />
      <PriceCell
        game={game}
        side={sp}
        main={formatPoint(sp?.point)}
        sheetId={`sp-${game.id}-${idx}`}
        sub={sp ? formatAmerican(sp.best.american) : undefined}
        sheetTitle={`${team.abbr} ${formatPoint(sp?.point)} — every book`}
      />
    </div>
    {team.tags.length > 0 && (
      <div className="mt-1.5 flex flex-wrap gap-1 pl-11">
        {team.tags.map((t) => (
          <Tag key={t.label} tag={t} />
        ))}
      </div>
    )}
    </div>
  );
}

/* ---------- Card ---------- */

export function GameCard({ game }: { game: Game }) {
  const total = game.markets.total;
  const live = game.status.state === "in";
  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <header className="mb-3 grid grid-cols-[1fr_3.25rem_4rem_4.5rem] gap-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        <span className={`text-sm normal-case tracking-normal ${live ? "text-good" : game.status.state === "post" ? "text-muted" : "text-fg"}`}>
          {game.status.state === "pre" ? <LocalTime iso={game.startTime} /> : game.status.detail}
        </span>
        <span className="text-right">Win %</span>
        <span className="text-center">ML</span>
        <span className="text-center">Spread</span>
      </header>

      <div className="space-y-3">
        <TeamRow game={game} team={game.away} idx={0} />
        <TeamRow game={game} team={game.home} idx={1} />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_3.25rem_4rem_4.5rem] items-center gap-2 border-t border-line pt-3">
        <span className="col-span-2 text-sm text-muted">
          Total <span className="font-semibold tabular-nums text-fg">{total ? formatPoint(total.sides[0].point, false) : "—"}</span>
        </span>
        <PriceCell
          game={game}
          side={total?.sides[0]}
          main={`O ${formatAmerican(total?.sides[0].best.american)}`}
          sheetId={`ov-${game.id}`}
          signedPoint={false}
          sheetTitle={`Over ${formatPoint(total?.sides[0].point, false)} — every book`}
        />
        <PriceCell
          game={game}
          side={total?.sides[1]}
          main={`U ${formatAmerican(total?.sides[1].best.american)}`}
          sheetId={`un-${game.id}`}
          signedPoint={false}
          sheetTitle={`Under ${formatPoint(total?.sides[1].point, false)} — every book`}
        />
      </div>

      <p className="mt-3 text-[10px] text-faint">
        {game.oddsSource
          ? `Odds: ${game.oddsSource.name}${game.oddsSource.bookCount > 1 ? ` · best of ${game.oddsSource.bookCount} books` : ""}`
          : "Odds: no data yet"}
      </p>
    </article>
  );
}
