import Image from "next/image";
import { LocalTime } from "./local-time";
import { Sheet } from "./sheet";
import { BetButton } from "./slip/bet-button";
import { legFromGameBet } from "@/lib/slip/legs";
import Link from "next/link";
import { Tag } from "./tag";
import {
  formatAmerican,
  formatPct,
  formatPoint,
  impliedMath,
  impliedProbability,
  removeVig,
} from "@/lib/odds-math";
import type { Game, Market, TeamSide } from "@/lib/types";

/* ---------- Win % with the math one tap away ---------- */

function pickExampleBook(m: Market) {
  // Show the math with one real book that lists both sides.
  for (const a of m.sides[0].all) {
    const b = m.sides[1].all.find((p) => p.bookKey === a.bookKey);
    if (b) return { book: a.book, a: a.american, b: b.american };
  }
  return null;
}

function WinPct({ game, idx, className = "text-right" }: { game: Game; idx: 0 | 1; className?: string }) {
  const m = game.markets.moneyline;
  const side = m?.sides[idx];
  if (!m || side?.fairProb === undefined) return <span className="text-faint">—</span>;
  const ex = pickExampleBook(m);
  const books = m.sides[0].all.length;
  return (
    <Sheet
      id={`wp-${game.id}-${idx}`}
      title={`Where ${formatPct(side.fairProb)} comes from`}
      triggerClassName={`w-full ${className} text-xl font-semibold tabular-nums underline decoration-faint decoration-dotted underline-offset-4`}
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

/* ---------- A tappable price ---------- */

function Price({ game, betKey, main, sub }: { game: Game; betKey: string; main: string; sub?: string }) {
  const bet = game.bets[betKey];
  const multi = (game.oddsSource?.bookCount ?? 0) > 1;
  const subLine = [sub, multi ? bet?.price.book : undefined].filter(Boolean).join(" · ");
  return (
    <BetButton
      leg={game.status.state === "pre" ? legFromGameBet(game, betKey) : undefined}
      main={main}
      sub={subLine || undefined}
      edge={bet?.edge}
    />
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
            <Link href={`/game/${game.id}`} className="text-base font-semibold">
              {team.abbr}
            </Link>
            {team.record && <span className="whitespace-nowrap text-xs tabular-nums text-muted">{team.record}</span>}
          </div>
        </div>
      </div>
      {showScore ? (
        <span className="text-right text-xl font-semibold tabular-nums">{team.score}</span>
      ) : (
        <WinPct game={game} idx={idx} />
      )}
      <Price game={game} betKey={`moneyline:${idx}`} main={formatAmerican(ml?.best.american)} />
      <Price
        game={game}
        betKey={`spread:${idx}`}
        main={formatPoint(sp?.point)}
        sub={sp ? formatAmerican(sp.best.american) : undefined}
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

export { WinPct };

export function GameCard({ game }: { game: Game }) {
  const total = game.markets.total;
  const live = game.status.state === "in";
  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <header className="mb-3 grid grid-cols-[1fr_3.25rem_4rem_4.5rem] gap-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        <span className={`text-sm normal-case tracking-normal ${live ? "text-good" : game.status.state === "post" ? "text-muted" : "text-fg"}`}>
          {game.status.state === "pre" ? <LocalTime iso={game.startTime} /> : game.status.detail}
        </span>
        <span className="text-right">{game.status.state === "pre" ? "Win %" : "Score"}</span>
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
        <Price game={game} betKey="total:0" main={`O ${formatAmerican(total?.sides[0].best.american)}`} />
        <Price game={game} betKey="total:1" main={`U ${formatAmerican(total?.sides[1].best.american)}`} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[10px] text-faint">
          {game.oddsSource
            ? `Odds: ${game.oddsSource.name}${game.oddsSource.bookCount > 1 ? ` · best of ${game.oddsSource.bookCount} books` : ""}`
            : "Odds: no data yet"}
        </p>
        <Link href={`/game/${game.id}`} className="-my-2 shrink-0 py-2 pl-4 text-xs font-medium text-muted">
          Details ›
        </Link>
      </div>
    </article>
  );
}
