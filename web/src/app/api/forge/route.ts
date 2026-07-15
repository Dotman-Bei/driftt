import { NextResponse } from "next/server";
import { forge, usingLLM } from "@/lib/oracle";
import { CHAIN_WRITES_ENABLED, forgeOnChain } from "@/lib/serverChain";
import type { GameId } from "@/lib/types";

export const runtime = "nodejs";
// An on-chain forge waits on validator consensus — allow well over the ~2 min it takes.
export const maxDuration = 300;

// Lightweight probe: confirms whether the server will forge on-chain or simulate,
// without paying the multi-minute cost of an actual forge.
export async function GET() {
  return NextResponse.json({
    chainWrites: CHAIN_WRITES_ENABLED,
    registry: process.env.NEXT_PUBLIC_ITEM_REGISTRY ?? null,
    hasKey: Boolean(process.env.GENLAYER_PRIVATE_KEY),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      gameId?: GameId;
      eventContext?: string;
      player?: string;
    };

    if (!body.gameId || !body.eventContext || body.eventContext.length < 10) {
      return NextResponse.json(
        { error: "gameId and a substantive eventContext are required" },
        { status: 400 },
      );
    }

    // Real chain when a deployer key is configured; otherwise the local oracle.
    // The two return the same shape — the caller only needs `usingChain` to label
    // where consensus ran and (on chain) to keep the item's real on-chain id.
    if (CHAIN_WRITES_ENABLED) {
      const player =
        body.player && /^0x[0-9a-fA-F]{40}$/.test(body.player)
          ? body.player
          : "0x" + "0".repeat(40);
      const result = await forgeOnChain(body.gameId, body.eventContext, player);
      return NextResponse.json({ ...result, usingChain: true, usingLLM: true });
    }

    const result = await forge(body.gameId, body.eventContext);
    return NextResponse.json({ ...result, usingChain: false, usingLLM });
  } catch (err) {
    console.error("forge failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "forge failed" },
      { status: 500 },
    );
  }
}
