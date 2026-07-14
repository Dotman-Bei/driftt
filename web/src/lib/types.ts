export type Rarity = "common" | "rare" | "epic" | "legendary";

export type GameId = "emberfall" | "nova-drift";

export interface Item {
  itemId: number;
  owner: string;
  originGame: GameId;
  canonicalName: string;
  /**
   * The thing that actually travels between games. Numeric stats never do — a
   * fantasy ATK value is meaningless to a space shooter.
   */
  semanticDescriptor: string;
  powerTier: number; // 1-100, comparable across every game
  rarity: Rarity;
  lore: string;
  artworkPrompt: string;
}

export interface Translation {
  itemId: number;
  originGame: GameId;
  targetGame: GameId;
  originPowerTier: number;
  translatedName: string;
  translatedStats: Record<string, string | number>;
  adaptedLore: string;
  powerTier: number;
  balanceJustification: string;
}

export type ProvenanceKind = "forged" | "translated" | "evolved";

export interface ProvenanceEntry {
  kind: ProvenanceKind;
  game: GameId;
  fromGame?: GameId;
  name: string;
  powerTier: number;
  note: string;
  at: number;
}

/** One validator's independent run of the same non-deterministic logic. */
export interface ValidatorVote {
  validator: string;
  role: "leader" | "validator";
  agreed: boolean;
  powerTier: number;
  /** Why this validator agreed or dissented, judged against the equivalence principle. */
  note: string;
}

export interface Consensus {
  votes: ValidatorVote[];
  agreedCount: number;
  totalCount: number;
  approved: boolean;
  /** The equivalence principle the validators judged the leader's proposal against. */
  principle: string;
  appealed: boolean;
}

export interface ForgeResult {
  item: Omit<Item, "itemId" | "owner">;
  consensus: Consensus;
}

export interface TranslateResult {
  translation: Translation;
  consensus: Consensus;
}

export interface EvolveResult {
  powerGain: number;
  newPowerTier: number;
  newRarity: Rarity;
  loreChapter: string;
  evolutionSummary: string;
  consensus: Consensus;
}

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

export function rarityForPower(power: number): Rarity {
  if (power <= 30) return "common";
  if (power <= 55) return "rare";
  if (power <= 80) return "epic";
  return "legendary";
}
