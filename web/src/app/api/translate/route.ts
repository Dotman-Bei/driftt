import { NextResponse } from "next/server";
import { translate, usingLLM } from "@/lib/oracle";
import { CHAIN_WRITES_ENABLED, translateOnChain } from "@/lib/serverChain";
import type { GameId, Item } from "@/lib/types";

export const runtime = "nodejs";
// An on-chain translation waits on validator consensus.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      item?: Item;
      targetGame?: GameId;
    };

    if (!body.item || !body.targetGame) {
      return NextResponse.json(
        { error: "item and targetGame are required" },
        { status: 400 },
      );
    }
    if (body.item.originGame === body.targetGame) {
      return NextResponse.json(
        { error: "item is already native to that game" },
        { status: 400 },
      );
    }

    // On chain, request_translation reads the item from the registry by id, so it
    // only works for items that were actually forged on-chain. If the item is not
    // on-chain (it was forged in simulated mode) or the chain is unavailable (a
    // Studio reset), fall back to the oracle so translation still works. usingChain
    // reports which path ran.
    if (CHAIN_WRITES_ENABLED) {
      try {
        const result = await translateOnChain(body.item, body.targetGame);
        return NextResponse.json({ ...result, usingChain: true, usingLLM: true });
      } catch (chainErr) {
        console.warn("on-chain translate failed, falling back to local consensus:", chainErr);
      }
    }

    const result = await translate(body.item, body.targetGame);
    return NextResponse.json({ ...result, usingChain: false, usingLLM });
  } catch (err) {
    console.error("translate failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "translation failed" },
      { status: 500 },
    );
  }
}
