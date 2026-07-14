import { NextResponse } from "next/server";
import { forge, usingLLM } from "@/lib/oracle";
import type { GameId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      gameId?: GameId;
      eventContext?: string;
    };

    if (!body.gameId || !body.eventContext || body.eventContext.length < 10) {
      return NextResponse.json(
        { error: "gameId and a substantive eventContext are required" },
        { status: 400 },
      );
    }

    const result = await forge(body.gameId, body.eventContext);
    return NextResponse.json({ ...result, usingLLM });
  } catch (err) {
    console.error("forge failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "forge failed" },
      { status: 500 },
    );
  }
}
