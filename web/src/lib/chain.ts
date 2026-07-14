"use client";

import { createClient, createAccount } from "genlayer-js";
import {
  studionet,
  testnetAsimov,
  testnetBradbury,
  localnet,
} from "genlayer-js/chains";
import { CalldataAddress, TransactionStatus } from "genlayer-js/types";
import type { GameId, Item, Rarity } from "./types";

/*
  The live GenLayer path.

  Driftt runs in one of two modes:

    SIMULATED — no contract addresses configured. Consensus is executed by
      lib/oracle.ts (real leader/validator/equivalence-principle/appeal logic)
      and settled in the browser. This is what runs out of the box.

    CHAIN — NEXT_PUBLIC_ITEM_REGISTRY and friends are set by `python deploy.py`.
      Reads and writes go to the deployed Intelligent Contracts, and consensus
      is executed by real GenLayer validators under Optimistic Democracy.

  The difference is one env var. Nothing else in the UI changes.
*/

export const ADDRESSES = {
  registry: process.env.NEXT_PUBLIC_ITEM_REGISTRY ?? "",
  forge: process.env.NEXT_PUBLIC_ITEM_FORGE ?? "",
  translation: process.env.NEXT_PUBLIC_TRANSLATION_ENGINE ?? "",
  evolution: process.env.NEXT_PUBLIC_EVOLUTION_TRACKER ?? "",
} as const;

/** The Intelligent Contracts are deployed and their addresses are configured. */
export const CONTRACTS_DEPLOYED = Boolean(ADDRESSES.registry && ADDRESSES.forge);

/**
 * Whether the UI *settles* what you do on-chain.
 *
 * This is deliberately false, and it is not the same question as whether the
 * contracts exist. The adapter below is complete and the contracts are live, but
 * routing gameplay through them would mean: an LLM run on every validator, a wait
 * for consensus, and then a wait for the appeal window to close before a forged
 * item even appears — because mint_item is emitted on="finalized". That is minutes
 * per action, and it would make the games unplayable.
 *
 * So the UI simulates by default, and the on-chain path is exercised explicitly
 * (see web/scripts/forge-onchain.mjs). The nav reads this flag rather than
 * CONTRACTS_DEPLOYED, so the badge always states where consensus actually ran.
 */
export const UI_SETTLES_ON_CHAIN = false;

export const CHAIN_MODE = CONTRACTS_DEPLOYED && UI_SETTLES_ON_CHAIN;

const CHAINS = {
  "testnet-bradbury": testnetBradbury,
  "testnet-asimov": testnetAsimov,
  studionet,
  localnet,
} as const;

function chain() {
  const name = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN ??
    "testnet-bradbury") as keyof typeof CHAINS;
  return CHAINS[name] ?? testnetBradbury;
}

type Address = `0x${string}`;

function client(account?: Address) {
  return createClient({ chain: chain(), account });
}

/**
 * Wrap a hex address so the GenVM receives an Address rather than a string.
 *
 * A bare "0x..." string is encoded into calldata as a *string*. A contract method
 * that declares `Address` then gets a str, and the transaction dies inside the
 * GenVM — after reaching consensus, so it looks like a success unless you inspect
 * the execution result. Every address argument has to go through here.
 */
function asAddress(hex: string) {
  const bytes = new Uint8Array(
    (hex.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)),
  );
  return new CalldataAddress(bytes);
}

/* --------------------------------------------------------------------- reads */

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
    // The forge stores the image prompt as the URI until the off-chain art
    // resolver backfills the IPFS CID, so the art pipeline can never block a mint.
    artworkPrompt: raw.artwork_uri.replace(/^art:prompt\//, ""),
  };
}

/** Every item held by an address, straight out of ItemRegistry. */
export async function fetchItems(owner: Address): Promise<Item[]> {
  const raw = (await client().readContract({
    address: ADDRESSES.registry as Address,
    functionName: "get_items_by_owner",
    args: [asAddress(owner)],
  })) as string;
  return (JSON.parse(raw) as RawItem[]).map(toItem);
}

/** The approved translation a game loads to render an imported item. */
export async function fetchTranslation(itemId: number, targetGame: GameId) {
  const raw = (await client().readContract({
    address: ADDRESSES.translation as Address,
    functionName: "get_translation",
    args: [itemId, targetGame],
  })) as string;
  const parsed = JSON.parse(raw);
  return Object.keys(parsed).length ? parsed : null;
}

/** The item's full journey across games. Append-only. */
export async function fetchHistory(itemId: number) {
  const raw = (await client().readContract({
    address: ADDRESSES.registry as Address,
    functionName: "get_history",
    args: [itemId],
  })) as string;
  return JSON.parse(raw);
}

export async function fetchActivity(limit = 40) {
  const raw = (await client().readContract({
    address: ADDRESSES.registry as Address,
    functionName: "get_activity",
    args: [limit],
  })) as string;
  return JSON.parse(raw);
}

/* -------------------------------------------------------------------- writes */

/*
  Each of these lands an INTELLIGENT method: the transaction only settles once
  GenLayer's validators have independently re-run the LLM logic and agreed the
  result is fair under the Equivalence Principle.

  Two things this has to get right, both learned against the live chain:

  · Wait for ACCEPTED, not FINALIZED. Consensus has already happened at ACCEPTED.
    FINALIZED only arrives after the appeal window closes, minutes later — waiting
    for it makes every action in the UI look like a hang.

  · Consensus succeeding is NOT the contract succeeding. A transaction reaches
    ACCEPTED with result AGREE when the validators unanimously agree — including
    when they unanimously agree that the contract THREW. That only shows up in
    txExecutionResult as FINISHED_WITH_ERROR. Checking the consensus status alone
    reports a failed forge as a success.
*/

interface GenReceipt {
  statusName?: string;
  txExecutionResultName?: string;
  txExecutionResult?: number;
}

async function send(
  account: Address,
  address: string,
  functionName: string,
  args: unknown[],
) {
  const c = client(account);
  const hash = await c.writeContract({
    address: address as Address,
    functionName,
    args: args as never,
    value: BigInt(0),
  });

  const receipt = (await c.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 4000,
    retries: 180,
  })) as GenReceipt;

  const exec = receipt?.txExecutionResultName ?? receipt?.txExecutionResult;
  if (exec === "FINISHED_WITH_ERROR" || exec === 2) {
    throw new Error(
      `${functionName}: the validators reached consensus, but the contract rejected the call. ` +
        `The most common cause is a constraint the item could not satisfy — for a translation, ` +
        `that means the balance invariant.`,
    );
  }

  return receipt;
}

export function forgeOnChain(account: Address, gameId: GameId, eventContext: string) {
  return send(account, ADDRESSES.forge, "forge_item", [gameId, eventContext]);
}

export function translateOnChain(account: Address, itemId: number, targetGame: GameId) {
  return send(account, ADDRESSES.translation, "request_translation", [
    itemId,
    targetGame,
  ]);
}

export function evolveOnChain(account: Address, itemId: number, usageEvent: string) {
  return send(account, ADDRESSES.evolution, "evolve_item", [itemId, usageEvent]);
}

export { createAccount };
