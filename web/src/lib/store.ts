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
import { CHAIN_MODE } from "./chain";

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

export { CHAIN_MODE };
export type { State };
