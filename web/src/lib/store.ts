"use client";

import { useSyncExternalStore } from "react";
import type {
  Consensus,
  EvolveResult,
  GameId,
  Item,
  ProvenanceEntry,
  Translation,
} from "./types";
import { CHAIN_MODE, CONTRACTS_DEPLOYED } from "./chain";

/*
  The player's cross-game inventory.

  When the Intelligent Contracts are deployed and NEXT_PUBLIC_ITEM_REGISTRY is
  set, ItemRegistry is the source of truth and this is just a read cache. Without
  it, this IS the ledger — the demo runs end to end with no funded account, and
  the consensus you see in the UI is the real leader/validator/appeal machinery
  from lib/oracle.ts, just settled in the browser instead of on-chain.
*/

const KEY = "driftt.state.v1";

export interface ActivityEntry {
  kind: "forged" | "translated" | "evolved";
  itemId: number;
  owner: string;
  game: GameId;
  name: string;
  rarity?: string;
  powerTier: number;
  at: number;
}

interface State {
  address: string | null;
  items: Item[];
  translations: Translation[];
  provenance: Record<number, ProvenanceEntry[]>;
  timesEvolved: Record<number, number>;
  activity: ActivityEntry[];
  nextId: number;
}

const EMPTY: State = {
  address: null,
  items: [],
  translations: [],
  provenance: {},
  timesEvolved: {},
  activity: [],
  nextId: 0,
};

let state: State = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as State) };
  } catch {
    return EMPTY;
  }
}

function commit(next: State) {
  state = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked. The session still works, it just won't persist.
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    state = load();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): State {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    state = load();
  }
  return state;
}

function getServerSnapshot(): State {
  return EMPTY;
}

export function useDriftt() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ------------------------------------------------------------------- actions */

export function connect(address: string) {
  commit({ ...state, address });
}

/**
 * The current player address, or a fresh valid one that is persisted so it stays
 * stable across forges — the on-chain path needs a real 20-byte address to own
 * the item, and inventory reads it back by that same address.
 */
export function ensureAddress(): string {
  if (state.address) return state.address;
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const address =
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  commit({ ...state, address });
  return address;
}

export function disconnect() {
  commit({ ...state, address: null });
}

export function resetAll() {
  commit({ ...EMPTY, address: state.address });
}

export function recordForge(
  owner: string,
  item: Omit<Item, "itemId" | "owner">,
  consensus: Consensus,
): Item {
  const itemId = state.nextId;
  const full: Item = { ...item, itemId, owner };
  const at = Date.now();

  const entry: ProvenanceEntry = {
    kind: "forged",
    game: item.originGame,
    name: item.canonicalName,
    powerTier: item.powerTier,
    note: `${consensus.agreedCount} of ${consensus.totalCount} validators agreed the item was fairly balanced for the event.`,
    at,
  };

  const logged: ActivityEntry = {
    kind: "forged",
    itemId,
    owner,
    game: item.originGame,
    name: item.canonicalName,
    rarity: item.rarity,
    powerTier: item.powerTier,
    at,
  };

  commit({
    ...state,
    nextId: itemId + 1,
    items: [...state.items, full],
    provenance: { ...state.provenance, [itemId]: [entry] },
    activity: [logged, ...state.activity].slice(0, 40),
  });

  return full;
}

/**
 * Cache an item that was forged ON-CHAIN, keeping its real registry id.
 *
 * The chain path returns a full Item whose itemId is the registry's id — the same
 * id request_translation reads by — so it must be preserved verbatim, not
 * reassigned from the local sequence. This dedupes on that id, so re-reading the
 * chain does not create duplicates.
 */
export function recordChainForge(item: Item, consensus: Consensus): Item {
  const at = Date.now();

  const entry: ProvenanceEntry = {
    kind: "forged",
    game: item.originGame,
    name: item.canonicalName,
    powerTier: item.powerTier,
    note: `${consensus.agreedCount} of ${consensus.totalCount} validators agreed on-chain that the item was fairly balanced for the event.`,
    at,
  };

  const logged: ActivityEntry = {
    kind: "forged",
    itemId: item.itemId,
    owner: item.owner,
    game: item.originGame,
    name: item.canonicalName,
    rarity: item.rarity,
    powerTier: item.powerTier,
    at,
  };

  commit({
    ...state,
    items: [...state.items.filter((i) => i.itemId !== item.itemId), item],
    nextId: Math.max(state.nextId, item.itemId + 1),
    provenance: { ...state.provenance, [item.itemId]: [entry] },
    activity: [logged, ...state.activity].slice(0, 40),
  });

  return item;
}

/**
 * Merge items read from the chain into the local cache, keyed by their real id.
 *
 * Items forged on-chain in this session are already cached; this catches anything
 * else the registry holds for the owner (e.g. forged on another device). Existing
 * entries win on nothing but presence — the chain is the source of truth, so its
 * version replaces the cached one, but provenance already recorded locally is kept.
 */
export function mergeChainItems(chainItems: Item[]) {
  if (chainItems.length === 0) return;
  const byId = new Map(state.items.map((i) => [i.itemId, i]));
  for (const item of chainItems) byId.set(item.itemId, item);

  const provenance = { ...state.provenance };
  let nextId = state.nextId;
  for (const item of chainItems) {
    nextId = Math.max(nextId, item.itemId + 1);
    if (!provenance[item.itemId]) {
      provenance[item.itemId] = [
        {
          kind: "forged",
          game: item.originGame,
          name: item.canonicalName,
          powerTier: item.powerTier,
          note: "Read from the on-chain registry.",
          at: Date.now(),
        },
      ];
    }
  }

  commit({
    ...state,
    items: Array.from(byId.values()).sort((a, b) => a.itemId - b.itemId),
    provenance,
    nextId,
  });
}

export function recordTranslation(translation: Translation, consensus: Consensus) {
  const at = Date.now();
  const existing = state.provenance[translation.itemId] ?? [];

  const entry: ProvenanceEntry = {
    kind: "translated",
    game: translation.targetGame,
    fromGame: translation.originGame,
    name: translation.translatedName,
    powerTier: translation.powerTier,
    note: translation.balanceJustification,
    at,
  };

  const logged: ActivityEntry = {
    kind: "translated",
    itemId: translation.itemId,
    owner: state.address ?? "0x0",
    game: translation.targetGame,
    name: translation.translatedName,
    powerTier: translation.powerTier,
    at,
  };

  commit({
    ...state,
    translations: [
      ...state.translations.filter(
        (t) =>
          !(t.itemId === translation.itemId && t.targetGame === translation.targetGame),
      ),
      translation,
    ],
    provenance: { ...state.provenance, [translation.itemId]: [...existing, entry] },
    activity: [logged, ...state.activity].slice(0, 40),
  });
  void consensus;
}

export function recordEvolution(item: Item, result: EvolveResult, usageEvent: string) {
  const at = Date.now();
  const existing = state.provenance[item.itemId] ?? [];

  const entry: ProvenanceEntry = {
    kind: "evolved",
    game: item.originGame,
    name: result.evolutionSummary,
    powerTier: result.newPowerTier,
    note: usageEvent,
    at,
  };

  const logged: ActivityEntry = {
    kind: "evolved",
    itemId: item.itemId,
    owner: item.owner,
    game: item.originGame,
    name: result.evolutionSummary,
    powerTier: result.newPowerTier,
    at,
  };

  commit({
    ...state,
    items: state.items.map((i) =>
      i.itemId === item.itemId
        ? {
            ...i,
            powerTier: result.newPowerTier,
            rarity: result.newRarity,
            lore: `${i.lore}\n\n${result.loreChapter}`,
          }
        : i,
    ),
    provenance: { ...state.provenance, [item.itemId]: [...existing, entry] },
    timesEvolved: {
      ...state.timesEvolved,
      [item.itemId]: (state.timesEvolved[item.itemId] ?? 0) + 1,
    },
    activity: [logged, ...state.activity].slice(0, 40),
  });
}

/* ------------------------------------------------------------------ selectors */

export function itemById(s: State, itemId: number): Item | undefined {
  return s.items.find((i) => i.itemId === itemId);
}

export function translationFor(
  s: State,
  itemId: number,
  targetGame: GameId,
): Translation | undefined {
  return s.translations.find((t) => t.itemId === itemId && t.targetGame === targetGame);
}

/** Items a given game can actually render: natives, plus anything translated into it. */
export function playableIn(s: State, game: GameId) {
  const native = s.items.filter((i) => i.originGame === game);
  const imported = s.translations
    .filter((t) => t.targetGame === game)
    .map((t) => ({ translation: t, item: itemById(s, t.itemId) }))
    .filter((x): x is { translation: Translation; item: Item } => Boolean(x.item));
  return { native, imported };
}

export { CHAIN_MODE, CONTRACTS_DEPLOYED };
export type { State };
