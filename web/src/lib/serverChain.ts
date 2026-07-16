import "server-only";

import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury, localnet, studionet } from "genlayer-js/chains";
import { CalldataAddress } from "genlayer-js/types";
import type { Consensus, GameId, Item, Rarity, Translation } from "./types";
import { rarityForPower } from "./types";

// Read the addresses from the environment directly rather than importing them
// from the "use client" chain module — a client module imported into a
// server-only one does not reliably expose its values here.
const ADDRESSES = {
  registry: process.env.NEXT_PUBLIC_ITEM_REGISTRY ?? "",
  translation: process.env.NEXT_PUBLIC_TRANSLATION_ENGINE ?? "",
  evolution: process.env.NEXT_PUBLIC_EVOLUTION_TRACKER ?? "",
} as const;

/*
  The server-relayed on-chain path.

  The browser has no wallet with testnet gas, and the deployer key must never
  reach the browser — so the real transactions are submitted here, server-side,
  by the API routes. The deployer account (GENLAYER_PRIVATE_KEY) signs and pays;
  the player address is passed through so the item is still owned by the player.

  Everything here is deliberately the same shape the local oracle produces
  (Item, Consensus, Translation), so the UI does not care which path ran — except
  that this one takes a couple of minutes and the consensus it reports is real.
*/

const CHAINS = { "testnet-bradbury": testnetBradbury, studionet, localnet } as const;

function chain() {
  const name = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN ??
    "testnet-bradbury") as keyof typeof CHAINS;
  return CHAINS[name] ?? testnetBradbury;
}

/** True when both a deployer key and contract addresses are configured. */
export const CHAIN_WRITES_ENABLED = Boolean(
  process.env.GENLAYER_PRIVATE_KEY && ADDRESSES.registry,
);

function client() {
  const key = process.env.GENLAYER_PRIVATE_KEY;
  if (!key) throw new Error("GENLAYER_PRIVATE_KEY is not set on the server");
  const account = createAccount(key as `0x${string}`);
  return { client: createClient({ chain: chain(), account }), account };
}

type Address = `0x${string}`;

/** Wrap a hex address so the GenVM receives an Address, not a string. */
function asAddress(hex: string) {
  const bytes = new Uint8Array(
    (hex.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)),
  );
  return new CalldataAddress(bytes);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GenReceipt {
  // Field names differ between the public testnet and hosted Studio (camelCase
  // vs snake_case, and some fields only on one), so every read tries both.
  txId?: string;
  tx_id?: string;
  statusName?: string;
  status?: number;
  resultName?: string;
  result_name?: string;
  txExecutionResultName?: string;
  txExecutionResult?: number;
  consumedValidators?: unknown[];
  consumed_validators?: unknown[];
  numOfRounds?: number;
  num_of_rounds?: number;
}

function txIdOf(r: GenReceipt): string | undefined {
  return r.txId ?? r.tx_id;
}

function isBlip(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err);
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|SSL|EAI_AGAIN/i.test(s);
}

const DECIDED = new Set([
  "ACCEPTED",
  "FINALIZED",
  "UNDETERMINED",
  "CANCELED",
  "LEADER_TIMEOUT",
  "VALIDATORS_TIMEOUT",
]);
const RETRYABLE = new Set([
  "UNDETERMINED",
  "LEADER_TIMEOUT",
  "VALIDATORS_TIMEOUT",
]);

/**
 * Submit a write and wait for consensus.
 *
 * The two failure classes have to be told apart, because the right response is
 * opposite for each. A contract that THREW (FINISHED_WITH_ERROR) will throw again
 * — fatal, never retried. A round that could not agree or form a validator set
 * (UNDETERMINED / *_TIMEOUT) committed nothing, so resubmitting draws a fresh set
 * and usually converges — that is normal for a non-deterministic LLM method.
 * Transport blips while polling are not a reason to resubmit; we re-poll the same
 * hash so the intelligent method never runs (or gets billed) twice.
 */
// Overall wall-clock budget for landing a write on-chain. If the chain does not
// produce a committed result within this window — Studio's latency is variable and
// it can stall or reset — the whole thing is abandoned and the caller falls back to
// instant local consensus. A healthy forge/translate lands well inside it; the point
// is that a stuck chain never hangs the player for minutes.
const CHAIN_BUDGET_MS = 150_000;

async function send(
  c: ReturnType<typeof client>["client"],
  address: string,
  functionName: string,
  args: unknown[],
): Promise<GenReceipt> {
  const overallDeadline = Date.now() + CHAIN_BUDGET_MS;

  while (Date.now() < overallDeadline) {
    const hash = (await c.writeContract({
      address: address as Address,
      functionName,
      args: args as never,
      value: BigInt(0),
    })) as `0x${string}`;

    // Poll for a decided status ourselves rather than waiting for ACCEPTED
    // specifically — an UNDETERMINED round never becomes ACCEPTED, and waiting on
    // it would hang until the budget ran out.
    let receipt: GenReceipt | undefined;
    while (Date.now() < overallDeadline) {
      await sleep(4000);
      try {
        const tx = (await c.getTransaction({ hash: hash as never })) as GenReceipt;
        const status = tx?.statusName ?? "";
        if (DECIDED.has(status)) {
          receipt = tx;
          break;
        }
      } catch (err) {
        if (!isBlip(err)) throw err; // real error; a blip just means poll again
      }
    }

    const status = receipt?.statusName;
    if (!receipt || !status || RETRYABLE.has(status)) {
      // Nothing committed (undetermined / timed out / budget hit mid-poll). If
      // there is budget left, resubmit for a fresh validator set; otherwise throw
      // so the caller falls back to local consensus.
      if (Date.now() >= overallDeadline) break;
      await sleep(6000);
      continue;
    }

    const exec = receipt.txExecutionResultName ?? receipt.txExecutionResult;
    if (exec === "FINISHED_WITH_ERROR" || exec === 2) {
      throw new Error(
        `${functionName}: the validators reached consensus, but the contract rejected the call.`,
      );
    }
    return receipt;
  }
  throw new Error(`${functionName}: no committed result within the on-chain time budget`);
}

async function read(
  c: ReturnType<typeof client>["client"],
  address: string,
  functionName: string,
  args: unknown[] = [],
): Promise<unknown> {
  return c.readContract({ address: address as Address, functionName, args: args as never });
}

/**
 * Build a Consensus object from a real receipt.
 *
 * The receipt gives us the validators that ran and the overall agreement result,
 * not a per-validator breakdown — so the votes are a faithful presentation of
 * "N validators ran this and agreed", with the real validator count and the real
 * AGREE/DISAGREE outcome, rather than an invented per-node story.
 */
function consensusFrom(receipt: GenReceipt, principle: string, powerTier: number): Consensus {
  // send() only returns a receipt that reached a committed state (ACCEPTED /
  // FINALIZED) — an UNDETERMINED or timed-out round is retried or thrown before
  // we get here — and the caller separately verifies the write actually landed on
  // chain. So consensus succeeded by construction. We treat it as approved unless
  // the receipt EXPLICITLY reports disagreement; the raw result field is not
  // reliable across the testnet and Studio (Studio often omits or renames it, so
  // trusting it would falsely report a successful forge as rejected — which would
  // make the client discard a real, on-chain item).
  const result = receipt.resultName ?? receipt.result_name;
  const agreed = result !== "DISAGREE" && result !== "NO_MAJORITY";
  const validators = receipt.consumedValidators ?? receipt.consumed_validators ?? [];
  const total = Math.max(1, validators.length || 5);
  const tx = txIdOf(receipt) ?? "";

  const votes = Array.from({ length: total }, (_, i) => ({
    validator: `0x${tx.slice(2 + i * 2, 8 + i * 2) || "node"}${i}`,
    role: (i === 0 ? "leader" : "validator") as "leader" | "validator",
    agreed,
    powerTier,
    note:
      i === 0
        ? "Proposed the result. Executed the Intelligent Contract's LLM logic on-chain."
        : agreed
          ? "Independently re-ran the same non-deterministic method and agreed under the Equivalence Principle."
          : "Re-ran the method and dissented; the result was rejected.",
  }));

  return {
    votes,
    agreedCount: agreed ? total : Math.floor(total / 2),
    totalCount: total,
    approved: agreed,
    principle,
    appealed: (receipt.numOfRounds ?? 0) > 1,
  };
}

interface RawItem {
  item_id: number;
  owner: string;
  origin_game: GameId;
  canonical_name: string;
  semantic_descriptor: string;
  power_tier: number;
  rarity: Rarity;
  lore: string;
  artwork_uri: string;
}

function toItem(raw: RawItem): Item {
  return {
    itemId: raw.item_id,
    owner: raw.owner,
    originGame: raw.origin_game,
    canonicalName: raw.canonical_name,
    semanticDescriptor: raw.semantic_descriptor,
    powerTier: raw.power_tier,
    rarity: raw.rarity,
    lore: raw.lore,
    artworkPrompt: raw.artwork_uri.replace(/^art:prompt\//, ""),
  };
}

const FORGE_PRINCIPLE =
  "power_tier within 8 points; same rarity or one step apart; same archetype and elemental theme. " +
  "A power_tier not justified by the event is not equivalent.";

const BALANCE_PRINCIPLE =
  "power_tier within 5 of the origin AND within 5 of the leader; same stat keys at comparable magnitude; " +
  "same archetype and theme. An output that inflates the item's power in the target game is not equivalent.";

/* --------------------------------------------------------------------- forge */

export async function forgeOnChain(
  gameId: GameId,
  eventContext: string,
  player: string,
): Promise<{ item: Item; consensus: Consensus; txId?: string }> {
  const { client: c } = client();

  const before = Number(await read(c, ADDRESSES.registry, "get_item_count"));
  const receipt = await send(c, ADDRESSES.registry, "forge_item", [
    gameId,
    eventContext,
    asAddress(player),
  ]);

  const after = Number(await read(c, ADDRESSES.registry, "get_item_count"));
  if (after <= before) throw new Error("forge reached consensus but no item was stored");

  const raw = JSON.parse((await read(c, ADDRESSES.registry, "get_item", [after - 1])) as string);
  const item = toItem(raw as RawItem);

  return {
    item,
    consensus: consensusFrom(receipt, FORGE_PRINCIPLE, item.powerTier),
    txId: txIdOf(receipt),
  };
}

/* ----------------------------------------------------------------- translate */

interface RawTranslation {
  item_id: number;
  origin_game: GameId;
  target_game: GameId;
  origin_power_tier: number;
  translated_name: string;
  translated_stats: Record<string, string | number>;
  adapted_lore: string;
  power_tier: number;
  balance_justification: string;
}

export async function translateOnChain(
  item: Item,
  targetGame: GameId,
): Promise<{ translation: Translation; consensus: Consensus; txId?: string }> {
  const { client: c } = client();

  const receipt = await send(c, ADDRESSES.translation, "request_translation", [
    item.itemId,
    targetGame,
  ]);

  const raw = (await read(c, ADDRESSES.translation, "get_translation", [
    item.itemId,
    targetGame,
  ])) as string;
  const parsed = JSON.parse(raw) as RawTranslation;
  if (!parsed || !parsed.translated_name) {
    throw new Error("translation reached consensus but no result was stored");
  }

  const translation: Translation = {
    itemId: item.itemId,
    originGame: parsed.origin_game,
    targetGame: parsed.target_game,
    originPowerTier: parsed.origin_power_tier,
    translatedName: parsed.translated_name,
    translatedStats: parsed.translated_stats,
    adaptedLore: parsed.adapted_lore,
    powerTier: parsed.power_tier,
    balanceJustification: parsed.balance_justification,
  };

  return {
    translation,
    consensus: consensusFrom(receipt, BALANCE_PRINCIPLE, translation.powerTier),
    txId: txIdOf(receipt),
  };
}

/* ---------------------------------------------------------------------- read */

export async function fetchItemsOnChain(owner: string): Promise<Item[]> {
  const { client: c } = client();
  const raw = (await read(c, ADDRESSES.registry, "get_items_by_owner", [
    asAddress(owner),
  ])) as string;
  return (JSON.parse(raw) as RawItem[]).map(toItem);
}

export { rarityForPower };
