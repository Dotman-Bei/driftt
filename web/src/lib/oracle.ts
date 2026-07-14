import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { RULESETS, GAME_NAMES } from "./rulesets";
import {
  rarityForPower,
  RARITY_ORDER,
  type Consensus,
  type EvolveResult,
  type ForgeResult,
  type GameId,
  type Item,
  type Rarity,
  type TranslateResult,
  type ValidatorVote,
} from "./types";

/*
  This module is the off-chain mirror of what the Intelligent Contracts do
  on-chain. It exists so the demo runs the instant you clone the repo, with no
  funded testnet account and no deployment.

  It models Optimistic Democracy honestly:
    - a LEADER validator runs the non-deterministic logic and proposes a result,
    - two other VALIDATORS independently re-run the SAME logic,
    - each compares its own output to the leader's via the EQUIVALENCE PRINCIPLE
      (semantic equivalence within a tolerance — never byte equality, because
      LLM output varies),
    - a majority must agree before the result is committed,
    - a validator that produced an out-of-tolerance result is the outlier, and a
      failed majority escalates to an appeal with a larger validator set.

  The one thing it does NOT do is settle on-chain. When the contracts are
  deployed and NEXT_PUBLIC_* addresses are set, the frontend reads and writes
  the real chain instead of this. See lib/store.ts.
*/

const MODEL = "claude-opus-4-8";
const VALIDATOR_IDS = ["0xVAL-01", "0xVAL-02", "0xVAL-03"];
const APPEAL_IDS = ["0xVAL-04", "0xVAL-05"];

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const usingLLM = anthropic !== null;

/* ------------------------------------------------------- equivalence principles */

export const FORGE_PRINCIPLE =
  "power_tier within 8 points; rarity identical or one step apart; same archetype and elemental theme. " +
  "Wording and names may differ freely. A power_tier not justified by the event is NOT equivalent.";

export const BALANCE_PRINCIPLE =
  "power_tier within 5 points of the leader AND within 5 of the origin tier; same stat keys at comparable " +
  "magnitude; same archetype and theme. An output that inflates the item's power in the target game is NOT equivalent.";

export const EVOLUTION_PRINCIPLE =
  "power_gain within 3 of the leader and never above the cap; the same rarity-upgrade decision; the same kind of change. " +
  "A large gain for a trivial or repetitive event is NOT equivalent.";

/* ------------------------------------------------------------------ LLM plumbing */

async function askJSON<T>(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  if (!anthropic) throw new Error("no api key");
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema },
    },
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block in response");
  return JSON.parse(text.text) as T;
}

function jsonSchema(props: Record<string, unknown>) {
  return {
    type: "object",
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
  };
}

/* ------------------------------------------------------------- offline generator */

/*
  When there is no ANTHROPIC_API_KEY, each validator runs this instead. It is
  seeded per-validator, so the three validators genuinely produce independent,
  slightly different results — exactly like three nodes sampling an LLM. The
  equivalence principle then does real work: jitter inside the tolerance agrees,
  jitter outside it dissents and triggers an appeal.
*/
function seed(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function jitter(rand: number, spread: number): number {
  return Math.round((rand - 0.5) * 2 * spread);
}

/** Reads the difficulty of a gameplay event out of its text. */
function difficultyOf(eventContext: string): number {
  const text = eventContext.toLowerCase();
  let power = 34;
  if (/\bboss\b|dragon|warden|leviathan|dreadnought/.test(text)) power += 30;
  if (/\bsolo\b|alone|no damage|flawless|without/.test(text)) power += 14;
  if (/\belite\b|champion|ancient|prototype/.test(text)) power += 12;
  if (/\bswarm\b|horde|wave|\d{2,}\s*(enemies|hostiles|kills)/.test(text)) power += 8;
  if (/\btrivial\b|training|dummy|tutorial|practice/.test(text)) power -= 20;
  const level = text.match(/level\s*(\d+)/);
  if (level) power += Math.min(12, Math.floor(Number(level[1]) / 3));
  return Math.max(5, Math.min(97, power));
}

const FIRE_WORDS = /fire|ember|ash|flame|burn|scorch|plasma|heat|magma/;
const ICE_WORDS = /ice|frost|cryo|glacial|rime|chill/;

function themeOf(text: string): "fire" | "ice" | "nature" {
  const t = text.toLowerCase();
  if (ICE_WORDS.test(t)) return "ice";
  if (FIRE_WORDS.test(t)) return "fire";
  return "nature";
}

const OFFLINE_NAMES: Record<string, string[]> = {
  fire: ["Ashfall Greatsword", "Emberbrand", "Cinderreach Blade", "Pyre-Tempered Edge"],
  ice: ["Rimewarden Blade", "Glacier's Tooth", "Frostbound Cleaver", "Hoarfrost Edge"],
  nature: ["Rootbound Maul", "Verdant Ruin", "Thornwake Blade", "Hollowgrove Edge"],
};

function offlineForge(gameId: GameId, eventContext: string, salt: string) {
  const basePower = difficultyOf(eventContext);
  const power = Math.max(
    1,
    Math.min(100, basePower + jitter(seed(salt, eventContext, "power"), 4)),
  );
  const theme = themeOf(eventContext);
  const names = OFFLINE_NAMES[theme];
  const name = names[Math.floor(seed(salt, eventContext, "name") * names.length)];
  const rarity = rarityForPower(power);
  const heavy = power > 70 ? "immensely heavy" : power > 45 ? "solid" : "light";

  return {
    canonical_name: name,
    semantic_descriptor:
      `A two-handed ${theme}-aligned melee weapon, ${heavy} in the hand and slow to recover between ` +
      `strikes. It trades speed and safety for the ability to end a fight in one committed blow, and it ` +
      `carries a lingering ${theme} bite that keeps working after the swing lands. Its power sits ` +
      `${power > 80 ? "at the very top of what the world permits" : power > 55 ? "well above a common armament" : "close to a workaday weapon"}.`,
    power_tier: power,
    rarity,
    lore:
      `Recovered after ${eventContext.trim().replace(/\.$/, "")}. It remembers the moment, and it has not ` +
      `cooled since.`,
    artwork_prompt: `A ${theme}-marked ${heavy} two-handed blade, ash and ruin, grim and old`,
    balance_justification:
      `Tier ${power} is set by the difficulty of the event and the risk the player accepted. ` +
      `Rarity ${rarity} follows from the tier band.`,
  };
}

function offlineTranslate(
  item: Item,
  targetGame: GameId,
  salt: string,
): RawTranslate {
  const power = Math.max(
    1,
    Math.min(100, item.powerTier + jitter(seed(salt, item.itemId, "translate"), 3)),
  );
  const theme = themeOf(item.semanticDescriptor + item.canonicalName);

  if (targetGame === "nova-drift") {
    // Heavy, slow, high-impact melee becomes heavy, slow, high-impact ordnance.
    // The cost that was DURABILITY becomes OVERHEAT_RISK.
    const energy = theme === "ice" ? "ion" : theme === "fire" ? "plasma" : "laser";
    const damage = Math.round(power * 0.62 + 12);
    return {
      translated_name: item.canonicalName.replace(
        /(Greatsword|Blade|Edge|Cleaver|Maul|Tooth|Brand)$/i,
        energy === "plasma" ? "Plasma Lance" : energy === "ion" ? "Ion Lance" : "Beam Lance",
      ),
      translated_stats: {
        DAMAGE: damage,
        SHIELD: Math.round(power * 0.22),
        FIRE_RATE: Math.max(5, 42 - Math.round(power * 0.3)),
        ENERGY_TYPE: energy,
        OVERHEAT_RISK: Math.min(95, Math.round(power * 0.78)),
      },
      adapted_lore:
        `Salvaged, re-cored, and mounted to a hardpoint it was never designed for. ${item.lore.split(".")[0]}. ` +
        `The heat signature is still wrong, and no one has been able to explain why.`,
      power_tier: power,
      balance_justification:
        `The origin item was a slow, committed, high-impact melee weapon at tier ${item.powerTier}. In Nova Drift ` +
        `that archetype is a low FIRE_RATE, high DAMAGE weapon whose cost is OVERHEAT_RISK — the direct analogue ` +
        `of the durability penalty it carried in Emberfall. Net power is held at ${power}, so it dominates nothing.`,
    };
  }

  return {
    translated_name: item.canonicalName.replace(
      /(Lance|Cannon|Driver|Array)$/i,
      "Greatsword",
    ),
    translated_stats: {
      ATK: Math.round(power * 0.78),
      DEF: Math.round(power * 0.2),
      ELEMENT: theme,
      DURABILITY: Math.max(5, 100 - Math.round(power * 0.72)),
    },
    adapted_lore:
      `${item.lore.split(".")[0]}. Re-forged for a world with no reactors, it burns the same way it always did.`,
    power_tier: power,
    balance_justification:
      `Sustained-fire ordnance at tier ${item.powerTier} maps to a heavy melee weapon: high ATK, and a low ` +
      `DURABILITY standing in for the overheat penalty. Net power is held at ${power}.`,
  };
}

function offlineEvolve(item: Item, usageEvent: string, headroom: number, salt: string) {
  const grindy = /\b(farm|grind|repeat|again|dummy|training)\b/i.test(usageEvent);
  const heroic = /\b(boss|solo|flawless|no damage|100|hundred|survived)\b/i.test(usageEvent);
  let gain = grindy ? 0 : heroic ? 3 : 1;
  gain = Math.max(0, Math.min(headroom, gain + jitter(seed(salt, usageEvent, "gain"), 1)));

  const newPower = Math.min(100, item.powerTier + gain);
  const upgraded = rarityForPower(newPower) !== item.rarity && gain > 0;

  return {
    power_gain: gain,
    rarity_upgraded: upgraded,
    lore_chapter: grindy
      ? `It was used, and used, and used. Nothing about it changed. The world does not reward repetition.`
      : `${usageEvent.trim().replace(/\.$/, "")}. The edge came back different, and a little more certain of itself.`,
    evolution_summary: grindy
      ? "No structural change. Event did not meet the threshold."
      : `Edge re-tempered by sustained use. +${gain} power.`,
  };
}

/* ------------------------------------------------------------- consensus machinery */

interface Proposal<T> {
  validator: string;
  role: "leader" | "validator";
  value: T;
}

/**
 * Run the same non-deterministic logic on N independent validators, then judge
 * every non-leader proposal against the leader's via the equivalence principle.
 */
async function reachConsensus<T>(
  principle: string,
  run: (validatorId: string) => Promise<T>,
  equivalent: (leader: T, other: T) => { ok: boolean; note: string },
  powerOf: (value: T) => number,
): Promise<{ consensus: Consensus; value: T }> {
  const settle = async (ids: string[]) => {
    const values = await Promise.all(ids.map((id) => run(id)));
    return ids.map((id, i) => ({
      validator: id,
      role: i === 0 ? ("leader" as const) : ("validator" as const),
      value: values[i],
    }));
  };

  let proposals: Proposal<T>[] = await settle(VALIDATOR_IDS);
  let appealed = false;

  const tally = (ps: Proposal<T>[]): ValidatorVote[] => {
    const leader = ps[0].value;
    return ps.map((p, i) => {
      if (i === 0) {
        return {
          validator: p.validator,
          role: "leader" as const,
          agreed: true,
          powerTier: powerOf(p.value),
          note: "Proposed the result. Awaiting independent review.",
        };
      }
      const verdict = equivalent(leader, p.value);
      return {
        validator: p.validator,
        role: "validator" as const,
        agreed: verdict.ok,
        powerTier: powerOf(p.value),
        note: verdict.note,
      };
    });
  };

  let votes = tally(proposals);
  let agreed = votes.filter((v) => v.agreed).length;

  // A failed majority escalates: more validators are pulled in and the outlier
  // is outvoted rather than trusted.
  if (agreed <= proposals.length / 2) {
    appealed = true;
    const extra = await settle(APPEAL_IDS);
    proposals = [...proposals, ...extra.map((p) => ({ ...p, role: "validator" as const }))];
    votes = tally(proposals);
    agreed = votes.filter((v) => v.agreed).length;
  }

  return {
    consensus: {
      votes,
      agreedCount: agreed,
      totalCount: votes.length,
      approved: agreed > votes.length / 2,
      principle,
      appealed,
    },
    value: proposals[0].value,
  };
}

/* ------------------------------------------------------------------------- forge */

interface RawForge {
  canonical_name: string;
  semantic_descriptor: string;
  power_tier: number;
  rarity: string;
  lore: string;
  artwork_prompt: string;
  balance_justification: string;
}

export async function forge(
  gameId: GameId,
  eventContext: string,
): Promise<ForgeResult> {
  const ruleset = RULESETS[gameId];

  const run = async (validatorId: string): Promise<RawForge> => {
    if (!anthropic) return offlineForge(gameId, eventContext, validatorId);
    return askJSON<RawForge>(
      `You are a game item designer working inside a live economy.

A player triggered this event:
${eventContext}

The game '${gameId}' has this ruleset:
${ruleset}

Design one item this event should award.
- power_tier (1-100) MUST be justified by the difficulty of the event. A trivial event yields a low tier. Only a genuinely hard, high-risk event may exceed 80.
- rarity must agree with power_tier: common 1-30, rare 31-55, epic 56-80, legendary 81-100.
- semantic_descriptor is the most important field. Describe what the item IS in game-agnostic language: archetype, how it is wielded, its element, its weight and feel, its power relative to the world. It must contain NO numeric stats and NO stat names from this game — other games translate the item from this description alone.
- lore is 1-3 sentences that travel with the item forever.
- balance_justification: one sentence on why this tier is fair for this event.`,
      jsonSchema({
        canonical_name: { type: "string" },
        semantic_descriptor: { type: "string" },
        power_tier: { type: "integer" },
        rarity: { type: "string", enum: RARITY_ORDER },
        lore: { type: "string" },
        artwork_prompt: { type: "string" },
        balance_justification: { type: "string" },
      }),
    );
  };

  const { consensus, value } = await reachConsensus<RawForge>(
    FORGE_PRINCIPLE,
    run,
    (leader, other) => {
      const dp = Math.abs(leader.power_tier - other.power_tier);
      const dr = Math.abs(
        RARITY_ORDER.indexOf(leader.rarity as Rarity) -
          RARITY_ORDER.indexOf(other.rarity as Rarity),
      );
      if (dp > 8)
        return {
          ok: false,
          note: `Dissent: proposed tier ${other.power_tier} vs leader ${leader.power_tier} — ${dp} points apart, outside the 8-point tolerance.`,
        };
      if (dr > 1)
        return {
          ok: false,
          note: `Dissent: rarity ${other.rarity} is more than one step from the leader's ${leader.rarity}.`,
        };
      return {
        ok: true,
        note: `Independently designed a ${other.rarity} item at tier ${other.power_tier}. Equivalent to the leader's proposal.`,
      };
    },
    (v) => v.power_tier,
  );

  const power = Math.max(1, Math.min(100, Math.round(value.power_tier)));

  return {
    item: {
      originGame: gameId,
      canonicalName: value.canonical_name,
      semanticDescriptor: value.semantic_descriptor,
      powerTier: power,
      rarity: rarityForPower(power),
      lore: value.lore,
      artworkPrompt: value.artwork_prompt,
    },
    consensus,
  };
}

/* --------------------------------------------------------------------- translate */

interface RawTranslate {
  translated_name: string;
  translated_stats: Record<string, string | number>;
  adapted_lore: string;
  power_tier: number;
  balance_justification: string;
}

export async function translate(
  item: Item,
  targetGame: GameId,
): Promise<TranslateResult> {
  const targetRuleset = RULESETS[targetGame];
  const originRuleset = RULESETS[item.originGame];

  const run = async (validatorId: string): Promise<RawTranslate> => {
    if (!anthropic) return offlineTranslate(item, targetGame, validatorId);
    return askJSON<RawTranslate>(
      `You are a cross-game balancing engine. Translate this item into the target game's stat system WITHOUT breaking its balance.

ITEM: ${item.canonicalName}
WHAT IT IS: ${item.semanticDescriptor}
ORIGIN POWER TIER: ${item.powerTier}/100
ORIGIN RARITY: ${item.rarity}
ORIGIN LORE: ${item.lore}

ORIGIN GAME ('${item.originGame}') RULESET: ${originRuleset}

TARGET GAME ('${targetGame}') RULESET: ${targetRuleset}

Hard constraints:
- translated_stats must use EXACTLY the stat names the target ruleset defines, and nothing else. Do not invent stats. Do not carry over the origin game's stats.
- power_tier MUST be within 5 points of ${item.powerTier}. You are NOT permitted to make the item stronger in the target game than it was in its origin. An item that dominates the target game's economy is a failure.
- Preserve the archetype and the elemental theme. A heavy fire melee weapon becomes a heavy heat-based weapon — not a shield, not a trinket.
- Adapt the lore so it reads as native to the target world while keeping the item's history recognisable. It is the same object, in a different world.
- balance_justification: one or two sentences on why these numbers are the fair equivalent, referencing the target game's power scale.`,
      jsonSchema({
        translated_name: { type: "string" },
        translated_stats: { type: "object", additionalProperties: true },
        adapted_lore: { type: "string" },
        power_tier: { type: "integer" },
        balance_justification: { type: "string" },
      }),
    );
  };

  const { consensus, value } = await reachConsensus<RawTranslate>(
    BALANCE_PRINCIPLE,
    run,
    (leader, other) => {
      const dLeader = Math.abs(leader.power_tier - other.power_tier);
      const dOrigin = Math.abs(other.power_tier - item.powerTier);
      if (dOrigin > 5)
        return {
          ok: false,
          note: `Dissent: tier ${other.power_tier} drifts ${dOrigin} points from the origin tier of ${item.powerTier}. That breaks the balance invariant — rejected.`,
        };
      if (dLeader > 5)
        return {
          ok: false,
          note: `Dissent: tier ${other.power_tier} is ${dLeader} points from the leader's ${leader.power_tier}, outside tolerance.`,
        };
      return {
        ok: true,
        note: `Re-ran the translation independently and landed on tier ${other.power_tier}. Power is preserved; the item is not overpowered in the target game.`,
      };
    },
    (v) => v.power_tier,
  );

  // The deterministic backstop. Even a unanimous validator set cannot push an
  // item past the balance invariant.
  const power = Math.max(
    item.powerTier - 5,
    Math.min(item.powerTier + 5, Math.round(value.power_tier)),
  );

  return {
    translation: {
      itemId: item.itemId,
      originGame: item.originGame,
      targetGame,
      originPowerTier: item.powerTier,
      translatedName: value.translated_name,
      translatedStats: value.translated_stats,
      adaptedLore: value.adapted_lore,
      powerTier: power,
      balanceJustification: value.balance_justification,
    },
    consensus,
  };
}

/* ------------------------------------------------------------------------ evolve */

interface RawEvolve {
  power_gain: number;
  rarity_upgraded: boolean;
  lore_chapter: string;
  evolution_summary: string;
}

const MAX_GAIN = 6;

export async function evolve(
  item: Item,
  usageEvent: string,
  timesEvolved: number,
): Promise<EvolveResult> {
  const headroom = Math.max(0, MAX_GAIN - timesEvolved);

  const run = async (validatorId: string): Promise<RawEvolve> => {
    if (!anthropic) return offlineEvolve(item, usageEvent, headroom, validatorId);
    return askJSON<RawEvolve>(
      `You are the chronicler of a persistent game item. Decide how it changed as a result of how it was used.

ITEM: ${item.canonicalName}
WHAT IT IS: ${item.semanticDescriptor}
CURRENT POWER TIER: ${item.powerTier}/100
CURRENT RARITY: ${item.rarity}
LORE SO FAR: ${item.lore}
TIMES ALREADY EVOLVED: ${timesEvolved}

THE EVENT:
${usageEvent}

Hard constraints:
- power_gain is an integer from 0 to ${headroom}. Most events deserve 0, 1 or 2. Award the maximum only for a genuinely extraordinary, hard-won event. A grindy or repetitive event deserves 0 — items must not be farmable into god-tier. This item has already evolved ${timesEvolved} time(s), so it has earned less headroom than a fresh one.
- rarity_upgraded is true ONLY if the gain pushes the item across a real threshold (common 1-30, rare 31-55, epic 56-80, legendary 81-100).
- lore_chapter is 1-2 sentences added to the item's story, referencing this specific event. A continuation, not a restatement.
- evolution_summary is a terse machine-voiced line describing the physical change.`,
      jsonSchema({
        power_gain: { type: "integer" },
        rarity_upgraded: { type: "boolean" },
        lore_chapter: { type: "string" },
        evolution_summary: { type: "string" },
      }),
    );
  };

  const { consensus, value } = await reachConsensus<RawEvolve>(
    EVOLUTION_PRINCIPLE,
    run,
    (leader, other) => {
      const dg = Math.abs(leader.power_gain - other.power_gain);
      if (other.power_gain > headroom)
        return {
          ok: false,
          note: `Dissent: a gain of ${other.power_gain} exceeds the ${headroom}-point ceiling this item has left. Farming an item into god-tier is exactly what the ceiling exists to stop.`,
        };
      if (dg > 3)
        return {
          ok: false,
          note: `Dissent: gain of ${other.power_gain} is ${dg} points from the leader's ${leader.power_gain}, outside tolerance.`,
        };
      return {
        ok: true,
        note: `Independently judged this event worth ${other.power_gain}. Equivalent to the leader.`,
      };
    },
    (v) => v.power_gain,
  );

  // Clamped after consensus. No amount of validator agreement can talk its way
  // past the protocol's own ceiling.
  const gain = Math.max(0, Math.min(headroom, Math.round(value.power_gain)));
  const newPower = Math.min(100, item.powerTier + gain);
  const proposed = value.rarity_upgraded ? rarityForPower(newPower) : item.rarity;

  let newRarity: Rarity = proposed;
  if (RARITY_ORDER.indexOf(newRarity) < RARITY_ORDER.indexOf(item.rarity)) {
    newRarity = item.rarity; // rarity may never fall
  }
  if (RARITY_ORDER.indexOf(newRarity) > RARITY_ORDER.indexOf(rarityForPower(newPower))) {
    newRarity = rarityForPower(newPower); // nor outrun the item's actual power
  }

  return {
    powerGain: gain,
    newPowerTier: newPower,
    newRarity,
    loreChapter: value.lore_chapter,
    evolutionSummary: value.evolution_summary,
    consensus,
  };
}

export { GAME_NAMES };
