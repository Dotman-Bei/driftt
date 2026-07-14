import { NextResponse } from "next/server";
import { translate, usingLLM } from "@/lib/oracle";
import type { GameId, Item } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const result = await translate(body.item, body.targetGame);
    return NextResponse.json({ ...result, usingLLM });
  } catch (err) {
    console.error("translate failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "translation failed" },
      { status: 500 },
    );
  }
}
