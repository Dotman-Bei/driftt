import { NextResponse } from "next/server";
import { evolve, usingLLM } from "@/lib/oracle";
import { CHAIN_WRITES_ENABLED, evolveOnChain } from "@/lib/serverChain";
import type { Item } from "@/lib/types";

export const runtime = "nodejs";
// An on-chain evolution waits on validator consensus.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      item?: Item;
      usageEvent?: string;
      timesEvolved?: number;
    };

    if (!body.item || !body.usageEvent || body.usageEvent.length < 10) {
      return NextResponse.json(
        { error: "item and a substantive usageEvent are required" },
        { status: 400 },
      );
    }

    // Strictly on-chain when contracts are configured — no fallback, same as forge
    // and translate. evolve_item is intelligent (LLM + consensus) and now lives in
    // the registry, so the growth lands at consensus.
    if (CHAIN_WRITES_ENABLED) {
      const result = await evolveOnChain(body.item, body.usageEvent);
      return NextResponse.json({ ...result, usingChain: true, usingLLM: true });
    }

    // Only reached when no contracts are configured (local dev without a deployment).
    const result = await evolve(body.item, body.usageEvent, body.timesEvolved ?? 0);
    return NextResponse.json({ ...result, usingChain: false, usingLLM });
  } catch (err) {
    console.error("evolve failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "evolution failed" },
      { status: 500 },
    );
  }
}
