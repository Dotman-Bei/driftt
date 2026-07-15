import { NextResponse } from "next/server";
import { CHAIN_WRITES_ENABLED, fetchItemsOnChain } from "@/lib/serverChain";

export const runtime = "nodejs";
export const maxDuration = 30;

// Read a player's items straight from the on-chain registry. Reads are fast (no
// consensus), so the inventory can sync from the chain on load. Served through an
// API route rather than read client-side so the same genlayer-js path is used
// everywhere and reads work regardless of the browser environment.
export async function GET(request: Request) {
  try {
    const owner = new URL(request.url).searchParams.get("owner");
    if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
      return NextResponse.json({ error: "valid owner address required" }, { status: 400 });
    }
    if (!CHAIN_WRITES_ENABLED) {
      return NextResponse.json({ items: [], usingChain: false });
    }
    const items = await fetchItemsOnChain(owner);
    return NextResponse.json({ items, usingChain: true });
  } catch (err) {
    console.error("items read failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "items read failed" },
      { status: 500 },
    );
  }
}
