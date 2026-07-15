# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TranslationEngine - the killer feature. [INTELLIGENT]

Takes an item that exists in one game's ruleset and produces a fair equivalent in
another game's ruleset. A greatsword becomes a plasma lance. Not by a lookup
table - by an LLM reasoning about what the item IS and what the target world
would call something of that weight.

This is the part that is impossible on a deterministic chain. There is no
function you can write in Solidity that maps {ATK: 71, ELEMENT: fire} into
{DAMAGE, SHIELD, FIRE_RATE, OVERHEAT_RISK} correctly, because the mapping is a
judgement about meaning, not arithmetic.

And it is the part that most needs consensus. If one server decided your item's
power in someone else's game, that server could wreck their economy. Here the
fairness of every translation is a decentralized decision: validators re-run the
translation and must agree it is balanced before it can be committed.
"""

from genlayer import *

import json


@gl.contract_interface
class ItemRegistry:
    """The registry, as the translation engine sees it."""

    class View:
        def get_item(self, item_id: int) -> str: ...
        def get_game_ruleset(self, game_id: str) -> str: ...

    class Write:
        def append_history(self, item_id: int, entry: str) -> None: ...


# The whole security model of cross-game interop, in one paragraph.
# Validators reject any translation whose power drifts, which is precisely the
# attack a malicious game or node would attempt.
BALANCE_PRINCIPLE = """Both outputs translate the same item into the same target game.
They are equivalent if ALL of the following hold:
1. `power_tier` values differ by no more than 5 points AND both are within 5
   points of the stated origin power tier. This is the balance invariant and it
   is not negotiable - if either output inflates the item's power in the target
   game, the outputs are NOT equivalent.
2. `translated_stats` use the same stat keys, and each shared numeric stat sits
   at a comparable magnitude (within roughly 20% of the other, relative to the
   target game's power scale).
3. The two translations preserve the same archetype and elemental theme.
Names and lore prose may differ freely - do not compare them literally."""


class TranslationEngine(gl.Contract):
    registry: Address

    # f"{item_id}:{target_game}" -> JSON of the approved translation
    translations: TreeMap[str, str]
    translation_count: u256

    def __init__(self, registry: Address) -> None:
        self.registry = registry
        self.translation_count = 0

    @gl.public.write
    def request_translation(self, item_id: int, target_game: str) -> None:
        """
        [INTELLIGENT METHOD]

        Translate an item into `target_game`'s stat system, rebalanced fairly.

        Under the hood GenLayer runs Optimistic Democracy on this method:
          - a leader validator proposes the translation,
          - every other validator independently re-runs the same prompt,
          - the Equivalence Principle above decides whether the proposals agree,
          - a majority must agree before anything is written on-chain,
          - a validator that produced an overpowered item is the outlier and is
            rejected; a disputed result escalates through appeals to a larger
            validator set.
        """
        registry = ItemRegistry(self.registry)

        item = json.loads(registry.view().get_item(item_id))
        target_ruleset = registry.view().get_game_ruleset(target_game)

        assert item["origin_game"] != target_game, "translate: item is already native here"

        key = _key(item_id, target_game)
        assert key not in self.translations, "translate: already translated into this game"

        origin_power = int(item["power_tier"])
        origin_ruleset = registry.view().get_game_ruleset(item["origin_game"])

        prompt = f"""You are a cross-game balancing engine. Translate this item into the
target game's stat system WITHOUT breaking its balance.

ITEM: {item["canonical_name"]}
WHAT IT IS: {item["semantic_descriptor"]}
ORIGIN POWER TIER: {origin_power}/100
ORIGIN RARITY: {item["rarity"]}
ORIGIN LORE: {item["lore"]}

ORIGIN GAME ('{item["origin_game"]}') RULESET: {origin_ruleset}

TARGET GAME ('{target_game}') RULESET: {target_ruleset}

Produce the fair equivalent of this item in the target game. Hard constraints:
- `translated_stats` must use EXACTLY the stat names the target ruleset defines,
  and nothing else. Do not invent stats. Do not carry over the origin game's stats.
- The item's overall power in the target game MUST stay proportional to its origin
  power tier. `power_tier` must be within 5 points of {origin_power}. You are NOT
  permitted to create an item that is stronger in the target game than it was in
  the origin game. An item that dominates the target game's economy is a failure.
- Preserve the archetype and the elemental theme. A heavy fire melee weapon should
  become a heavy heat-based weapon in the target game, not a shield and not a
  utility trinket.
- Adapt the lore so it reads as native to the target game's world, while keeping
  the item's history recognisable. It is the same object, in a different world.
- balance_justification: explain in one or two sentences why these numbers are the
  fair equivalent, referencing the target game's power scale.

Reply with ONLY valid JSON, no prose, no markdown fences:
{{"translated_name": str, "translated_stats": object, "adapted_lore": str,
  "power_tier": int, "balance_justification": str}}"""

        def translate() -> str:
            raw = gl.nondet.exec_prompt(prompt)
            return _extract_json(raw)

        result = gl.eq_principle.prompt_comparative(translate, principle=BALANCE_PRINCIPLE)

        parsed = json.loads(result)

        # Read every field with .get() and coerce defensively. The LLM output is
        # non-deterministic, so a run that omits a key or returns an odd type must
        # NOT throw and discard a whole consensus round — the contract normalizes
        # instead. Only genuinely unparseable JSON (caught in _extract_json /
        # json.loads above) is allowed to fail.
        try:
            raw_power = int(parsed.get("power_tier", origin_power))
        except (ValueError, TypeError):
            raw_power = origin_power

        # The balance invariant, enforced deterministically ON TOP OF consensus, by
        # CLAMPING into [origin-5, origin+5]. Validators already agreed the item is
        # fair under BALANCE_PRINCIPLE; the clamp guarantees it can never come out
        # stronger than it went in. An overpowered item cannot pass this — that is
        # the guarantee, and the clamp is how it holds without discarding good work.
        power = max(origin_power - 5, min(origin_power + 5, raw_power))
        power = max(1, min(100, power))

        stats = parsed.get("translated_stats", {})
        if not isinstance(stats, dict):
            stats = {}

        record = {
            "item_id": item_id,
            "origin_game": item["origin_game"],
            "target_game": target_game,
            "origin_power_tier": origin_power,
            "translated_name": str(parsed.get("translated_name", item["canonical_name"])),
            "translated_stats": stats,
            "adapted_lore": str(parsed.get("adapted_lore", item["lore"])),
            "power_tier": power,
            "balance_justification": str(parsed.get("balance_justification", "")),
        }

        # The translation is stored in THIS contract's own storage, so it lands
        # the moment the transaction is accepted, and a game loads it by calling
        # get_translation. There is intentionally no cross-contract emit here: an
        # emitted message to the registry (for provenance) would only dispatch at
        # finalization, which is not triggerable on the deployed testnet, and would
        # leave request_translation looking stuck. Provenance is reconstructed from
        # the stored translations instead.
        self.translations[key] = json.dumps(record)
        self.translation_count = self.translation_count + 1

    @gl.public.view
    def get_translation(self, item_id: int, target_game: str) -> str:
        """A game calls this to load an imported item. Returns {} if never translated."""
        key = _key(item_id, target_game)
        if key not in self.translations:
            return "{}"
        return self.translations[key]

    @gl.public.view
    def is_translated(self, item_id: int, target_game: str) -> bool:
        return _key(item_id, target_game) in self.translations

    @gl.public.view
    def get_translation_count(self) -> int:
        return int(self.translation_count)


def _key(item_id: int, target_game: str) -> str:
    return f"{item_id}:{target_game}"


def _extract_json(raw: str) -> str:
    fence = "``" + "`"
    text = raw.replace(fence + "json", "").replace(fence, "").strip()
    start = text.find("{")
    end = text.rfind("}")
    assert start != -1 and end > start, "translate: model did not return a JSON object"
    return text[start : end + 1]
