# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
EvolutionTracker - dynamic NFTs. [INTELLIGENT]

An item that has killed a hundred things in a space shooter should not be the
same object it was when it left the dungeon. The LLM decides how it grows: a
sharper edge, a scorched hull plate, a new chapter of lore.

Growth is deliberately stingy. The obvious exploit here is farming trivial events
to inflate an item until it breaks every game it touches, so the gain is capped
hard - both by the equivalence principle the validators judge against, and by a
deterministic clamp after consensus that no amount of validator agreement can
talk its way past.
"""

from genlayer import *

import json


@gl.contract_interface
class ItemRegistry:
    """The registry, as the evolution tracker sees it."""

    class View:
        def get_item(self, item_id: int) -> str: ...
        def get_history(self, item_id: int) -> str: ...

    class Write:
        def apply_evolution(
            self, item_id: int, new_power_tier: int, new_rarity: str, lore_chapter: str
        ) -> None: ...
        def append_history(self, item_id: int, entry: str) -> None: ...


MAX_GAIN_PER_EVOLUTION = 6
EVOLUTION_PRINCIPLE = """Both outputs describe how the same item evolved after the same event.
They are equivalent if ALL of the following hold:
1. `power_gain` values differ by no more than 3, and neither exceeds 6.
2. Both agree on whether the item's rarity increased (`rarity_upgraded` matches).
3. Both describe the same kind of change to the item - the same physical or
   thematic development, even if worded differently.
The prose of `lore_chapter` and `evolution_summary` may differ freely.
An output that awards a large power gain for a trivial or repetitive event is NOT
equivalent to one that correctly awards little or nothing."""

_RARITY_LADDER = ["common", "rare", "epic", "legendary"]


class EvolutionTracker(gl.Contract):
    registry: Address

    # item_id -> how many times it has evolved (drives diminishing returns)
    evolutions: TreeMap[u256, u256]
    evolution_count: u256

    def __init__(self, registry: Address) -> None:
        self.registry = registry
        self.evolution_count = 0

    @gl.public.write
    def evolve_item(self, item_id: int, usage_event: str) -> None:
        """
        [INTELLIGENT METHOD]

        Called after significant usage, e.g. "used to destroy 100 hostiles in
        Nova Drift". The LLM decides what that did to the object.
        """
        assert len(usage_event) > 10, "evolve: usage_event too thin"

        registry = ItemRegistry(self.registry)
        item = json.loads(registry.view().get_item(item_id))

        current_power = int(item["power_tier"])
        current_rarity = str(item["rarity"]).strip().lower()
        times_evolved = int(self.evolutions.get(u256(item_id), 0))

        # Diminishing returns: the fifth evolution is worth far less than the first.
        headroom = max(0, MAX_GAIN_PER_EVOLUTION - times_evolved)

        prompt = f"""You are the chronicler of a persistent game item. Decide how this item
changed as a result of how it was used.

ITEM: {item["canonical_name"]}
WHAT IT IS: {item["semantic_descriptor"]}
CURRENT POWER TIER: {current_power}/100
CURRENT RARITY: {current_rarity}
LORE SO FAR: {item["lore"]}
TIMES ALREADY EVOLVED: {times_evolved}

THE EVENT:
{usage_event}

Hard constraints:
- `power_gain` is an integer from 0 to {headroom}. Most events deserve 0, 1 or 2.
  Award the maximum only for a genuinely extraordinary, hard-won event. A grindy
  or repetitive event deserves 0 - items must not be farmable into god-tier.
  This item has already evolved {times_evolved} time(s), so it has earned less
  headroom than a fresh one.
- `rarity_upgraded` is true ONLY if the gain pushes the item across a real
  threshold (common 1-30, rare 31-55, epic 56-80, legendary 81-100). Otherwise false.
- `lore_chapter` is 1-2 sentences added to the item's story, referencing this
  specific event. It must read as a continuation, not a restatement.
- `evolution_summary` is a terse machine-voiced line describing the physical or
  thematic change, e.g. "Edge re-tempered by sustained plasma discharge."

Reply with ONLY valid JSON, no prose, no markdown fences:
{{"power_gain": int, "rarity_upgraded": bool, "lore_chapter": str,
  "evolution_summary": str}}"""

        def decide_evolution() -> str:
            raw = gl.nondet.exec_prompt(prompt)
            return _extract_json(raw)

        result = gl.eq_principle.prompt_comparative(
            decide_evolution, principle=EVOLUTION_PRINCIPLE
        )

        parsed = json.loads(result)

        # Clamp after consensus. Even a unanimous validator set cannot inflate an
        # item past the protocol's own ceiling.
        gain = max(0, min(int(parsed["power_gain"]), headroom))
        new_power = min(100, current_power + gain)
        new_rarity = _rarity_for(new_power) if bool(parsed["rarity_upgraded"]) else current_rarity

        # Rarity may never fall, and may never outrun the item's actual power.
        if _RARITY_LADDER.index(new_rarity) < _RARITY_LADDER.index(current_rarity):
            new_rarity = current_rarity
        if _RARITY_LADDER.index(new_rarity) > _RARITY_LADDER.index(_rarity_for(new_power)):
            new_rarity = _rarity_for(new_power)

        lore_chapter = str(parsed["lore_chapter"])
        summary = str(parsed["evolution_summary"])

        registry.emit().apply_evolution(item_id, new_power, new_rarity, lore_chapter)
        registry.emit().append_history(
            item_id,
            json.dumps(
                {
                    "kind": "evolved",
                    "game": item["origin_game"],
                    "power_tier": new_power,
                    "power_gain": gain,
                    "rarity": new_rarity,
                    "name": summary,
                    "note": usage_event,
                }
            ),
        )

        self.evolutions[u256(item_id)] = u256(times_evolved + 1)
        self.evolution_count = self.evolution_count + 1

    @gl.public.view
    def get_evolution_history(self, item_id: int) -> str:
        """Provenance lives in the registry - this is the convenience read-through."""
        registry = ItemRegistry(self.registry)
        return registry.view().get_history(item_id)

    @gl.public.view
    def get_times_evolved(self, item_id: int) -> int:
        return int(self.evolutions.get(u256(item_id), 0))


def _rarity_for(power: int) -> str:
    if power <= 30:
        return "common"
    if power <= 55:
        return "rare"
    if power <= 80:
        return "epic"
    return "legendary"


def _extract_json(raw: str) -> str:
    fence = "``" + "`"
    text = raw.replace(fence + "json", "").replace(fence, "").strip()
    start = text.find("{")
    end = text.rfind("}")
    assert start != -1 and end > start, "evolve: model did not return a JSON object"
    return text[start : end + 1]
