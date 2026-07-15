# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
ItemRegistry - the universal source of truth for Driftt.

Deliberately deterministic. This contract holds no LLM logic: it is the ledger
that the three Intelligent Contracts (ItemForge, TranslationEngine,
EvolutionTracker) write into once their non-deterministic output has survived
Optimistic Democracy.

An item is stored game-agnostically. The `semantic_descriptor` - a rich natural
language description of what the item *is* - is the thing that travels between
games. Numeric stats never do, because a fantasy ATK value is meaningless to a
space shooter.
"""

from genlayer import *

from dataclasses import dataclass
import json


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

    def __init__(self) -> None:
        self.admin = gl.message.sender_address
        self.item_count = 0

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
        """Called by ItemForge once validators have agreed on the generated item."""
        self._require_authorized()
        assert origin_game in self.rulesets, "registry: unknown origin game"
        assert 1 <= power_tier <= 100, "registry: power_tier out of range"

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
