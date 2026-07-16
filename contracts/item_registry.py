# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
ItemRegistry - the universal source of truth for Driftt.

The ledger AND the forge. It stores every item game-agnostically, and it runs the
LLM that forges new items from gameplay events under Optimistic Democracy.

Forging lives here, in the same contract as the storage it writes to, on purpose.
The original design had a separate ItemForge that *emitted* mint_item across
contracts — but on the deployed testnet an emitted cross-contract message is only
dispatched at finalization, and finalization is not currently triggerable there,
so the forged item never landed. A write to a contract's OWN storage, by contrast,
persists the moment the transaction is accepted. Keeping the forge and the store
in one contract is what makes an on-chain forge actually complete on this network.

An item is stored game-agnostically. The `semantic_descriptor` - a rich natural
language description of what the item *is* - is the thing that travels between
games. Numeric stats never do, because a fantasy ATK value is meaningless to a
space shooter.
"""

from genlayer import *

from dataclasses import dataclass
import json


# The forge's honest constraint. Validators judge each other's independently-run
# LLM output against this under the Equivalence Principle — semantic equivalence,
# never byte equality — which is what stops a rogue node from forging an
# overpowered item into the economy.
FORGE_PRINCIPLE = """Both outputs describe a game item generated from the same event.
They are equivalent if ALL of the following hold:
1. `power_tier` values differ by no more than 8 points.
2. `rarity` is the same, or one step apart on common < rare < epic < legendary.
3. The items share the same broad archetype (both a weapon, both armour, both a
   relic) and the same elemental/thematic flavour.
Wording, names, and prose may differ freely - do not compare them literally.
An output whose power_tier is not justified by the difficulty of the event is
NOT equivalent, even if the other fields match."""


# Evolution grows an item through use, but stingily — the exploit is farming
# trivial events to inflate an item until it breaks every game it touches. The
# gain is capped by both the equivalence principle the validators judge against
# and a deterministic clamp after consensus.
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


@allow_storage
@dataclass
class Item:
    owner: Address
    origin_game: str
    canonical_name: str
    semantic_descriptor: str
    power_tier: u256  # normalized 1-100 balance score, comparable across games
    rarity: str  # common | rare | epic | legendary
    lore: str
    artwork_uri: str


class ItemRegistry(gl.Contract):
    admin: Address

    item_count: u256
    items: TreeMap[u256, Item]

    # item_id -> JSON-encoded provenance entries, appended in chronological order
    history: TreeMap[u256, DynArray[str]]

    # owner -> the item ids they hold (kept as an index so reads stay cheap)
    owner_index: TreeMap[Address, DynArray[u256]]

    # game_id -> natural language ruleset, fed to the LLM during translation
    rulesets: TreeMap[str, str]
    games: DynArray[str]

    # Only the Intelligent Contracts may mint / mutate. Set by the admin at wiring time.
    authorized: TreeMap[Address, bool]

    # Append-only public log, read by the ForgeFeed UI
    activity: DynArray[str]

    # item_id -> how many times it has evolved (drives diminishing returns)
    evolutions: TreeMap[u256, u256]
    evolution_count: u256

    def __init__(self) -> None:
        self.admin = gl.message.sender_address
        self.item_count = 0
        self.evolution_count = 0

    # ---------------------------------------------------------------- internal

    def _require_admin(self) -> None:
        assert gl.message.sender_address == self.admin, "registry: admin only"

    def _require_authorized(self) -> None:
        sender = gl.message.sender_address
        if sender == self.admin:
            return
        assert self.authorized.get(sender, False), "registry: caller not authorized"

    def _log(self, entry: str) -> None:
        self.activity.append(entry)

    # ------------------------------------------------------------------ wiring

    @gl.public.write
    def set_authorized(self, contract: Address, allowed: bool) -> None:
        """Grant ItemForge / TranslationEngine / EvolutionTracker write access."""
        self._require_admin()
        self.authorized[contract] = allowed

    @gl.public.write
    def register_game(self, game_id: str, ruleset_description: str) -> None:
        """
        Register a game by describing its ruleset in plain language.

        This description is the *entire* integration surface for a new game.
        There is no shared stat schema to conform to - that is the point.
        """
        assert len(game_id) > 0, "registry: empty game_id"
        assert len(ruleset_description) > 20, "registry: ruleset too thin to translate against"

        if game_id not in self.rulesets:
            self.games.append(game_id)
        self.rulesets[game_id] = ruleset_description
        self._log(json.dumps({"kind": "game_registered", "game_id": game_id}))

    # ------------------------------------------------------------------ mutate

    def _store_item(
        self,
        owner: Address,
        origin_game: str,
        canonical_name: str,
        semantic_descriptor: str,
        power_tier: int,
        rarity: str,
        lore: str,
        artwork_uri: str,
        forge_justification: str,
    ) -> int:
        """Write an item into storage and return its id. Shared by mint_item and forge_item."""
        item_id = self.item_count
        self.item_count = item_id + 1

        self.items[item_id] = gl.storage.inmem_allocate(
            Item,
            owner,
            origin_game,
            canonical_name,
            semantic_descriptor,
            u256(power_tier),
            rarity,
            lore,
            artwork_uri,
        )
        # TreeMap does NOT auto-create a value for a missing key — self.map[k] on
        # an absent key raises KeyError. get_or_insert_default returns the stored
        # DynArray, creating an empty one first if this owner / item is new.
        self.owner_index.get_or_insert_default(owner).append(item_id)
        self.history.get_or_insert_default(item_id).append(
            json.dumps(
                {
                    "kind": "forged",
                    "game": origin_game,
                    "power_tier": power_tier,
                    "note": forge_justification,
                }
            )
        )
        self._log(
            json.dumps(
                {
                    "kind": "forged",
                    "item_id": item_id,
                    "owner": owner.as_hex,
                    "game": origin_game,
                    "name": canonical_name,
                    "rarity": rarity,
                    "power_tier": power_tier,
                }
            )
        )
        return item_id

    @gl.public.write
    def mint_item(
        self,
        owner: Address,
        origin_game: str,
        canonical_name: str,
        semantic_descriptor: str,
        power_tier: int,
        rarity: str,
        lore: str,
        artwork_uri: str,
        forge_justification: str,
    ) -> None:
        """Deterministic mint of a pre-decided item. Admin / authorized only."""
        self._require_authorized()
        assert origin_game in self.rulesets, "registry: unknown origin game"
        assert 1 <= power_tier <= 100, "registry: power_tier out of range"
        self._store_item(
            owner,
            origin_game,
            canonical_name,
            semantic_descriptor,
            power_tier,
            rarity,
            lore,
            artwork_uri,
            forge_justification,
        )

    @gl.public.write
    def forge_item(self, game_id: str, event_context: str, player: Address) -> None:
        """
        [INTELLIGENT METHOD]

        Forge a new item from a gameplay event, and store it — in one transaction.

        The non-determinism runs under Optimistic Democracy: a leader validator
        runs the prompt, every other validator independently re-runs it, and they
        must agree the design is equivalent under FORGE_PRINCIPLE before anything
        is written. Because the write is to this contract's OWN storage, the item
        lands the moment the transaction is accepted — no cross-contract emit, no
        finalization dependency.

        `player` is passed explicitly (rather than taken from the caller) so the
        item is owned by the player even when a server relays the transaction on
        their behalf.
        """
        assert game_id in self.rulesets, "forge: unknown game"
        assert len(event_context) > 10, "forge: event_context too thin"

        ruleset = self.rulesets[game_id]

        prompt = f"""You are a game item designer working inside a live economy.

A player triggered this event:
{event_context}

The game '{game_id}' has this ruleset:
{ruleset}

Design one item that this event should award. Rules you must obey:
- power_tier is an integer from 1 to 100 and MUST be justified by the difficulty
  of the event. A trivial event yields a low tier. Only a genuinely hard,
  high-risk event may exceed 80.
- rarity must be one of: common, rare, epic, legendary.
- semantic_descriptor describes what the item IS in game-agnostic language: its
  archetype, how it is wielded, its element, its weight and feel, its power
  relative to the world. It must contain NO numeric stats and NO stat names from
  this game, because other games translate the item from this description alone.
- lore is 1-3 sentences that travel with the item forever.
- balance_justification: one sentence on why this tier is fair for this event.

Reply with ONLY valid JSON, no prose, no markdown fences:
{{"canonical_name": str, "semantic_descriptor": str, "power_tier": int,
  "rarity": str, "lore": str, "artwork_prompt": str,
  "balance_justification": str}}"""

        def design_item() -> str:
            raw = gl.nondet.exec_prompt(prompt)
            return _extract_json(raw)

        # Non-deterministic. Validators re-run it and compare semantically.
        result = gl.eq_principle.prompt_comparative(design_item, principle=FORGE_PRINCIPLE)

        item = json.loads(result)

        # Read every field with .get() and coerce defensively. The LLM output is
        # non-deterministic, so a run that omits a key or returns an odd type must
        # NOT throw and discard a whole consensus round — normalize instead. Power
        # is clamped to range and rarity is derived from the power band (the model's
        # rarity label is advisory). Only unparseable JSON is allowed to fail.
        try:
            raw_power = int(item.get("power_tier", 40))
        except (ValueError, TypeError):
            raw_power = 40
        power = max(1, min(100, raw_power))
        rarity = _rarity_for(power)

        self._store_item(
            player,
            game_id,
            str(item.get("canonical_name", "Forged Relic")),
            str(item.get("semantic_descriptor", "An item won in battle.")),
            power,
            rarity,
            str(item.get("lore", "")),
            _artwork_uri(str(item.get("artwork_prompt", "a forged relic"))),
            str(item.get("balance_justification", "")),
        )

    @gl.public.write
    def append_history(self, item_id: int, entry: str) -> None:
        """
        Append a provenance entry. Called by TranslationEngine (on a successful
        cross-game translation) and EvolutionTracker (on an evolution).

        History is append-only: an item's journey across games is the asset.
        """
        self._require_authorized()
        assert item_id in self.items, "registry: unknown item"
        self.history.get_or_insert_default(item_id).append(entry)

    @gl.public.write
    def apply_evolution(
        self, item_id: int, new_power_tier: int, new_rarity: str, lore_chapter: str
    ) -> None:
        """Called by EvolutionTracker after consensus on how an item should grow."""
        self._require_authorized()
        assert item_id in self.items, "registry: unknown item"
        assert 1 <= new_power_tier <= 100, "registry: power_tier out of range"

        item = self.items[item_id]
        assert new_power_tier >= item.power_tier, "registry: evolution cannot weaken an item"

        item.power_tier = u256(new_power_tier)
        item.rarity = new_rarity
        item.lore = item.lore + "\n\n" + lore_chapter

    @gl.public.write
    def evolve_item(self, item_id: int, usage_event: str) -> None:
        """
        [INTELLIGENT METHOD]

        Grow an item through use. Like forge_item, this runs the LLM and writes to
        this contract's OWN storage in the same transaction, so the evolution lands
        at consensus rather than depending on cross-contract finalization.

        Growth is deliberately stingy and diminishing: the ceiling shrinks each time
        an item evolves, so an item cannot be farmed into a god-weapon — enforced by
        the equivalence principle AND a deterministic clamp after consensus.
        """
        assert len(usage_event) > 10, "evolve: usage_event too thin"
        assert item_id in self.items, "registry: unknown item"

        item = self.items[item_id]
        current_power = int(item.power_tier)
        current_rarity = str(item.rarity).strip().lower()
        times_evolved = int(self.evolutions.get(u256(item_id), 0))
        headroom = max(0, MAX_GAIN_PER_EVOLUTION - times_evolved)

        prompt = f"""You are the chronicler of a persistent game item. Decide how this item
changed as a result of how it was used.

ITEM: {item.canonical_name}
WHAT IT IS: {item.semantic_descriptor}
CURRENT POWER TIER: {current_power}/100
CURRENT RARITY: {current_rarity}
LORE SO FAR: {item.lore}
TIMES ALREADY EVOLVED: {times_evolved}

THE EVENT:
{usage_event}

Hard constraints:
- `power_gain` is an integer from 0 to {headroom}. Most events deserve 0, 1 or 2.
  Award the maximum only for a genuinely extraordinary, hard-won event. A grindy
  or repetitive event deserves 0 - items must not be farmable into god-tier. This
  item has already evolved {times_evolved} time(s), so it has earned less headroom.
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

        # Normalize defensively — the LLM output is non-deterministic, so a missing
        # or odd field must not throw and discard a consensus round.
        try:
            raw_gain = int(parsed.get("power_gain", 0))
        except (ValueError, TypeError):
            raw_gain = 0

        # Clamp after consensus. Even a unanimous validator set cannot inflate an
        # item past the protocol's own ceiling.
        gain = max(0, min(raw_gain, headroom))
        new_power = min(100, current_power + gain)
        new_rarity = _rarity_for(new_power) if bool(parsed.get("rarity_upgraded", False)) else current_rarity

        # Rarity may never fall, and may never outrun the item's actual power.
        if _RARITY_LADDER.index(new_rarity) < _RARITY_LADDER.index(current_rarity):
            new_rarity = current_rarity
        if _RARITY_LADDER.index(new_rarity) > _RARITY_LADDER.index(_rarity_for(new_power)):
            new_rarity = _rarity_for(new_power)

        lore_chapter = str(parsed.get("lore_chapter", ""))
        summary = str(parsed.get("evolution_summary", "Evolved through use."))

        # Write in place — the whole point of the merge.
        item.power_tier = u256(new_power)
        item.rarity = new_rarity
        if lore_chapter:
            item.lore = item.lore + "\n\n" + lore_chapter

        # The history entry carries everything the UI needs to render the result,
        # so no separate return value or cross-contract read is required.
        self.history.get_or_insert_default(item_id).append(
            json.dumps(
                {
                    "kind": "evolved",
                    "game": item.origin_game,
                    "power_tier": new_power,
                    "power_gain": gain,
                    "rarity": new_rarity,
                    "name": summary,
                    "lore_chapter": lore_chapter,
                    "note": usage_event,
                }
            )
        )
        self._log(
            json.dumps(
                {
                    "kind": "evolved",
                    "item_id": item_id,
                    "owner": item.owner.as_hex,
                    "game": item.origin_game,
                    "name": summary,
                    "rarity": new_rarity,
                    "power_tier": new_power,
                }
            )
        )

        self.evolutions[u256(item_id)] = u256(times_evolved + 1)
        self.evolution_count = self.evolution_count + 1

    @gl.public.write
    def transfer_item(self, item_id: int, to: Address) -> None:
        """Plain ownership transfer. Only the current holder may move an item."""
        assert item_id in self.items, "registry: unknown item"
        item = self.items[item_id]
        sender = gl.message.sender_address
        assert item.owner == sender, "registry: not the owner"

        held = self.owner_index.get_or_insert_default(sender)
        for i in range(len(held)):
            if held[i] == item_id:
                held[i] = held[len(held) - 1]
                held.pop()
                break

        item.owner = to
        self.owner_index.get_or_insert_default(to).append(item_id)
        self._log(
            json.dumps(
                {"kind": "transferred", "item_id": item_id, "to": to.as_hex}
            )
        )

    # ------------------------------------------------------------------- views

    @gl.public.view
    def get_item(self, item_id: int) -> str:
        assert item_id in self.items, "registry: unknown item"
        return json.dumps(self._item_dict(item_id))

    @gl.public.view
    def get_items_by_owner(self, owner: Address) -> str:
        ids = self.owner_index.get(owner, None)
        if ids is None:
            return json.dumps([])
        return json.dumps([self._item_dict(int(i)) for i in ids])

    @gl.public.view
    def get_game_ruleset(self, game_id: str) -> str:
        assert game_id in self.rulesets, "registry: unknown game"
        return self.rulesets[game_id]

    @gl.public.view
    def get_games(self) -> str:
        return json.dumps(
            [{"game_id": g, "ruleset": self.rulesets[g]} for g in self.games]
        )

    @gl.public.view
    def get_history(self, item_id: int) -> str:
        entries = self.history.get(item_id, None)
        if entries is None:
            return json.dumps([])
        return json.dumps([json.loads(e) for e in entries])

    @gl.public.view
    def get_item_count(self) -> int:
        return int(self.item_count)

    @gl.public.view
    def get_times_evolved(self, item_id: int) -> int:
        return int(self.evolutions.get(u256(item_id), 0))

    @gl.public.view
    def get_activity(self, limit: int) -> str:
        total = len(self.activity)
        start = 0 if limit <= 0 or limit >= total else total - limit
        return json.dumps([json.loads(self.activity[i]) for i in range(start, total)])

    def _item_dict(self, item_id: int) -> dict:
        item = self.items[item_id]
        return {
            "item_id": item_id,
            "owner": item.owner.as_hex,
            "origin_game": item.origin_game,
            "canonical_name": item.canonical_name,
            "semantic_descriptor": item.semantic_descriptor,
            "power_tier": int(item.power_tier),
            "rarity": item.rarity,
            "lore": item.lore,
            "artwork_uri": item.artwork_uri,
        }


# ---------------------------------------------------------------- forge helpers


def _extract_json(raw: str) -> str:
    """LLMs fence JSON even when told not to. Strip it, then take the outermost object."""
    fence = "``" + "`"
    text = raw.replace(fence + "json", "").replace(fence, "").strip()
    start = text.find("{")
    end = text.rfind("}")
    assert start != -1 and end > start, "forge: model did not return a JSON object"
    return text[start : end + 1]


def _rarity_for(power: int) -> str:
    if power <= 30:
        return "common"
    if power <= 55:
        return "rare"
    if power <= 80:
        return "epic"
    return "legendary"


def _artwork_uri(artwork_prompt: str) -> str:
    """
    Artwork is generated off-chain from this prompt and pinned to IPFS; the
    resolver watches the forge log and backfills the CID. Until it does, the
    prompt itself is the URI, so the art pipeline can never block a forge.
    """
    return "art:prompt/" + artwork_prompt
