import type { GameId } from "./types";

/**
 * Mirrors contracts/rulesets.py, which is what actually gets registered on-chain.
 *
 * This is the whole integration surface for a game joining Driftt: you describe
 * your game in English. There is no shared stat schema to conform to, which is
 * precisely why Emberfall and Nova Drift can be different genres and still trade.
 */
export const RULESETS: Record<GameId, string> = {
  emberfall:
    "Emberfall is a top-down fantasy dungeon crawler. Combat is melee-focused and " +
    "deliberate: you close distance, you commit to a swing, you get punished for it. " +
    "Items are described by exactly these stats: " +
    "ATK (integer 1-100, raw damage per swing), " +
    "DEF (integer 1-100, damage mitigated when struck), " +
    "ELEMENT (one of: fire, ice, nature - fire burns over time, ice slows, nature drains), " +
    "DURABILITY (integer 1-100, how many strikes the item survives before it must be " +
    "reforged; heavy, powerful weapons tend to have lower durability). " +
    "Overall power scale is 1-100, where 30 is a starting sword, 60 is a boss drop, " +
    "and 90+ is a world-defining artifact fewer than a dozen players hold. " +
    "The world is ash, ruin, and slow fire. Names and lore are grim and old.",
  "nova-drift":
    "Nova Drift is a twin-stick sci-fi space shooter. Combat is continuous and mobile: " +
    "you never stop moving, you never stop firing, and heat is the real enemy. " +
    "Items are described by exactly these stats: " +
    "DAMAGE (integer 1-100, damage per projectile), " +
    "SHIELD (integer 1-100, absorbed damage before hull loss), " +
    "FIRE_RATE (integer 1-100, projectiles per second, higher is faster), " +
    "ENERGY_TYPE (one of: plasma, laser, ion - plasma is heavy and burns, laser is " +
    "precise and fast, ion disrupts shields), " +
    "OVERHEAT_RISK (integer 1-100, chance the weapon locks out after sustained fire; " +
    "high-damage weapons carry high overheat risk - this is the balancing cost). " +
    "Overall power scale is 1-100, where 30 is a stock cannon, 60 is a salvaged relic, " +
    "and 90+ is a prototype that should not exist. " +
    "The world is cold, industrial, and lit by reactor glow. Names and lore are clipped " +
    "and technical.",
};

export const GAMES: { id: GameId; name: string; genre: string; blurb: string }[] = [
  {
    id: "emberfall",
    name: "Emberfall",
    genre: "Fantasy dungeon crawler",
    blurb:
      "Melee, deliberate, punishing. Clear the room, kill the thing that lives at the end of it, and the forge decides what you earned.",
  },
  {
    id: "nova-drift",
    name: "Nova Drift",
    genre: "Sci-fi twin-stick shooter",
    blurb:
      "Never stop moving, never stop firing. Heat is the real enemy. Import a sword from a dungeon and it arrives as something that fits here.",
  },
];

export const GAME_NAMES: Record<GameId, string> = {
  emberfall: "Emberfall",
  "nova-drift": "Nova Drift",
};

/** The stat keys each game's ruleset defines. Used to render translated stat blocks. */
export const STAT_KEYS: Record<GameId, string[]> = {
  emberfall: ["ATK", "DEF", "ELEMENT", "DURABILITY"],
  "nova-drift": ["DAMAGE", "SHIELD", "FIRE_RATE", "ENERGY_TYPE", "OVERHEAT_RISK"],
};

export function otherGame(game: GameId): GameId {
  return game === "emberfall" ? "nova-drift" : "emberfall";
}
