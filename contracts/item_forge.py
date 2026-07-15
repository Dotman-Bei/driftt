# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
ItemForge - AI-powered NFT generation. [INTELLIGENT]

A gameplay event ("defeated the Ashfall Dragon solo at level 12") goes in, a
balanced, themed, lore-bearing item comes out. No manual minting, no
pre-authored loot table.

The generation is non-deterministic, so it runs under Optimistic Democracy: the
leader validator proposes an item, the other validators independently re-run the
same prompt, and the Equivalence Principle decides whether their designs are the
*same item* - not the same bytes. A validator that hallucinates a power-120
god-weapon disagrees with the majority and is rejected.
"""

from genlayer import *

import json


@gl.contract_interface
class ItemRegistry:
    """
    The registry, as the forge sees it.

    Cross-contract calls go through a typed interface: `Registry(addr).view().m()`
    for reads and `.emit().m()` for writes. (The published docs still describe a
    `gl.ContractAt` helper — it does not exist in the deployed GenVM.)
    """

    class View:
        def get_game_ruleset(self, game_id: str) -> str: ...

    class Write:
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
        ) -> None: ...


# The forge's honest constraint. Validators judge equivalence against this, which
# is what stops a rogue node from minting an overpowered item into the economy.
FORGE_PRINCIPLE = """Both outputs describe a game item generated from the same event.
They are equivalent if ALL of the following hold:
1. `power_tier` values differ by no more than 8 points.
2. `rarity` is the same, or one step apart on common < rare < epic < legendary.
3. The items share the same broad archetype (both a weapon, both armour, both a
   relic) and the same elemental/thematic flavour.
Wording, names, and prose may differ freely - do not compare them literally.
An output whose power_tier is not justified by the difficulty of the event is
NOT equivalent, even if the other fields match."""


class ItemForge(gl.Contract):
    registry: Address
    forged_count: u256

    def __init__(self, registry: Address) -> None:
        self.registry = registry
        self.forged_count = 0

    @gl.public.write
    def forge_item(self, game_id: str, event_context: str) -> None:
        """
        [INTELLIGENT METHOD]

        Called by a game when a player triggers a loot event. The LLM designs an
        item that fits the game's registered ruleset and whose power is justified
        by what the player actually did.
        """
        assert len(event_context) > 10, "forge: event_context too thin"

        registry = ItemRegistry(self.registry)
        ruleset = registry.view().get_game_ruleset(game_id)
        player = gl.message.sender_address

        prompt = f"""You are a game item designer working inside a live economy.

A player triggered this event:
{event_context}

The game '{game_id}' has this ruleset:
{ruleset}

Design one item that this event should award. Rules you must obey:
- power_tier is an integer from 1 to 100 and MUST be justified by the difficulty
  of the event. A trivial event yields a low tier. Only a genuinely hard,
  high-risk event may exceed 80.
- rarity must be one of: common, rare, epic, legendary, and must agree with power_tier
  (common 1-30, rare 31-55, epic 56-80, legendary 81-100).
- semantic_descriptor is the most important field. It describes what the item IS
  in game-agnostic language: its archetype, how it is wielded, its element, its
  weight and feel, its power relative to the world. It must contain NO numeric
  stats and NO stat names from this game, because other games will translate the
  item from this description alone.
- lore is 1-3 sentences of narrative that travel with the item forever.
- artwork_prompt is a single-sentence prompt for an image model.

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

        # The output is non-deterministic, so the contract NORMALIZES rather than
        # asserts. Validators already agreed the item is fair under FORGE_PRINCIPLE;
        # rejecting it here because the model wrote "legendary" where the power band
        # says "epic" would throw away a perfectly good, consensus-approved item over
        # a labelling quibble. So: clamp the power into range, and derive the rarity
        # from the power band deterministically. Only genuinely malformed output —
        # missing keys, unparseable numbers — is allowed to fail.
        power = max(1, min(100, int(item["power_tier"])))
        rarity = _rarity_for(power)

        # Emit on "accepted": the mint dispatches as soon as the validators have
        # reached consensus, rather than waiting for the appeal window to close.
        #
        # The stricter choice is on="finalized", which withholds the mint until the
        # forge can no longer be appealed — genuinely better for "no unfair item
        # ever enters the economy". But finalization on this testnet is not reliably
        # triggerable (the consensus contract's canFinalize reverts long after the
        # window should have elapsed), so on="finalized" leaves the item unminted
        # indefinitely. "accepted" still runs the full Optimistic Democracy round —
        # every validator executes the LLM and must agree under FORGE_PRINCIPLE
        # before this line is reached — so the anti-cheat guarantee holds at
        # consensus; only the extra appeal-window delay is given up.
        registry.emit(on="accepted").mint_item(
            player,
            game_id,
            str(item["canonical_name"]),
            str(item["semantic_descriptor"]),
            power,
            rarity,
            str(item["lore"]),
            _artwork_uri(str(item["artwork_prompt"])),
            str(item.get("balance_justification", "")),
        )
        self.forged_count = self.forged_count + 1

    @gl.public.view
    def get_forged_count(self) -> int:
        return int(self.forged_count)


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
    prompt itself is the URI, so the art pipeline can never block a mint.
    """
    return "art:prompt/" + artwork_prompt
