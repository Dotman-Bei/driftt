/*
  Prove the registry stores items on-chain: item_count 0 -> 1, then read it back.

    node scripts/mint-onchain.mjs

  Why this is a separate step from the forge. forge_item runs the LLM on every
  validator, they agree under the Equivalence Principle, and it EMITS mint_item to
  the registry — all of which is proven (see forge-onchain.mjs: forged_count
  increments, and the emitted message carries the real LLM-generated item). But on
  this testnet the emitted cross-contract message is only dispatched at
  finalization, and finalization is not currently triggerable (the consensus
  contract's canFinalize reverts). So the auto-dispatch hop cannot complete here.

  The registry's write path itself works independently of that. The registry makes
  its deployer the admin, and mint_item admits the admin directly, so this calls
  mint_item as a normal top-level transaction and watches the item land. It closes
  the loop: the registry genuinely stores and serves items on-chain.
*/

import { addr, loadDeployments, makeClient, read, send } from "./genlayer.mjs";

const { contracts } = loadDeployments();
const { client, account } = makeClient();
const registry = contracts.ItemRegistry;

// The item a real forge produced on-chain (its LLM output, from the emitted
// mint_item message of tx 0x5ca2a8...): a flawlessly-forged fire longsword.
const item = {
  owner: account.address,
  origin_game: "emberfall",
  canonical_name: "Cinderbrand",
  semantic_descriptor:
    "A one-handed fire-aligned longsword, flawlessly forged and unnervingly light for its " +
    "reach. It rewards precision over force, and its edge carries a slow ember that keeps " +
    "burning after the cut. Its power sits well above a common armament without approaching " +
    "the artifacts that define the age.",
  power_tier: 72,
  rarity: "epic",
  lore:
    "Won from the Ashfall Dragon by a single unscarred hand. The blade has not cooled since, " +
    "and it remembers the fight.",
  artwork_uri: "art:prompt/a fire-marked flawless longsword, ash and ruin, grim and old",
  forge_justification:
    "Tier 72 reflects a solo, flawless kill of a named boss — hard-won, but short of a " +
    "world-defining relic.",
};

const before = Number(await read(client, registry, "get_item_count"));
console.log(`\nregistry ${registry}`);
console.log(`items before: ${before}\n`);

console.log("calling ItemRegistry.mint_item (as admin) ...");
await send(client, {
  address: registry,
  functionName: "mint_item",
  args: [
    addr(item.owner), // Address — must be wrapped
    item.origin_game,
    item.canonical_name,
    item.semantic_descriptor,
    item.power_tier,
    item.rarity,
    item.lore,
    item.artwork_uri,
    item.forge_justification,
  ],
});

const after = Number(await read(client, registry, "get_item_count"));
console.log(`\nitems after: ${after}`);

if (after <= before) throw new Error("mint did not land");

const minted = JSON.parse(await read(client, registry, "get_item", [after - 1]));
console.log("\n=== STORED ON-CHAIN ===");
console.log("item_id    :", minted.item_id);
console.log("name       :", minted.canonical_name);
console.log("power tier :", minted.power_tier, "|", minted.rarity);
console.log("owner      :", minted.owner);
console.log("descriptor :", minted.semantic_descriptor.slice(0, 90) + "...");

const owned = JSON.parse(await read(client, registry, "get_items_by_owner", [addr(item.owner)]));
console.log(`\nget_items_by_owner(${item.owner.slice(0, 8)}...) returned ${owned.length} item(s)`);

const activity = JSON.parse(await read(client, registry, "get_activity", [10]));
console.log(`activity log has ${activity.length} entr${activity.length === 1 ? "y" : "ies"}`);
console.log();
