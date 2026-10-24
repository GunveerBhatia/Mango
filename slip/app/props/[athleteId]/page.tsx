import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LocalTime } from "@/components/local-time";
import { PropView } from "@/components/props/prop-view";
import { PROP_LABELS, type PropStat } from "@/lib/model";
import { getPlayerProps } from "@/lib/props";

async function Player({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { athleteId } = await params;
  if (!/^\d+$/.test(athleteId)) notFound();
  const sp = await searchParams;
  const stat = (typeof sp.stat === "string" && sp.stat in PROP_LABELS ? sp.stat : "pts") as PropStat;
  const data = await getPlayerProps(athleteId);
  if (!data) return <p className="py-10 text-center text-sm text-muted">No data yet for this player.</p>;
  const { athlete, game, injury } = data;

  return (
    <>
      <header className="mb-5 flex items-center gap-4">
        {athlete.headshot ? (
          <Image src={athlete.headshot} alt="" width={64} height={64} unoptimized className="size-16 rounded-full bg-card object-cover" />
        ) : (
          <div className="size-16 rounded-full bg-card" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{athlete.name}</h1>
          <p className="text-sm text-muted">
            {athlete.teamAbbr}
            {athlete.position ? ` · ${athlete.position}` : ""}
            {game ? (
              <>
                {" · "}
                {game.home ? "vs" : "@"} {game.opponentAbbr} <LocalTime iso={game.startTime} />
              </>
            ) : (
              " · No game today"
            )}
          </p>
          {injury && <p className={`text-sm ${/out/i.test(injury) ? "text-bad" : "text-muted"}`}>Injury: {injury}</p>}
        </div>
      </header>
      <PropView data={data} initialStat={stat} />
    </>
  );
}

export default function PlayerPropsPage({ params, searchParams }: PageProps<"/props/[athleteId]">) {
  return (
    <main className="pt-5">
      <Link href="/props" className="mb-4 inline-block py-1 text-sm text-muted">
        ‹ Props
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-card" />}>
        <Player params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
