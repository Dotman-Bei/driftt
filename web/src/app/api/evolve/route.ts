import { NextResponse } from "next/server";
import { evolve, usingLLM } from "@/lib/oracle";
import type { Item } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const result = await evolve(body.item, body.usageEvent, body.timesEvolved ?? 0);
    return NextResponse.json({ ...result, usingLLM });
  } catch (err) {
    console.error("evolve failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "evolution failed" },
      { status: 500 },
    );
  }
}
