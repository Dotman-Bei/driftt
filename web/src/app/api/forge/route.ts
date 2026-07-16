import { NextResponse } from "next/server";
import { forge, usingLLM } from "@/lib/oracle";
import { CHAIN_WRITES_ENABLED, forgeOnChain } from "@/lib/serverChain";
import type { GameId } from "@/lib/types";

// When the contracts are configured, Driftt is strictly on-chain: a forge either
// settles on GenLayer or it fails loudly. There is deliberately NO fallback to
// local simulation — a chain outage surfaces as an error the player can see and
// retry, rather than a simulated result quietly dressed up as on-chain. The local
// engine (below) is only used when no contracts are configured at all.

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

    // Strictly on-chain when contracts are configured — no fallback. Any failure
    // (Studio reset, stall past the time budget, RPC error) propagates to the
    // catch below and returns an error the player sees, never a simulated item.
    if (CHAIN_WRITES_ENABLED) {
      const player =
        body.player && /^0x[0-9a-fA-F]{40}$/.test(body.player)
          ? body.player
          : "0x" + "0".repeat(40);
      const result = await forgeOnChain(body.gameId, body.eventContext, player);
      return NextResponse.json({ ...result, usingChain: true, usingLLM: true });
    }

    // Only reached when no contracts are configured at all (local dev without a
    // deployment). This is an explicit no-chain mode, not a fallback.
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
