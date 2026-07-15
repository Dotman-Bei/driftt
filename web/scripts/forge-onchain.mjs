/*
  Run a real forge through the live Intelligent Contracts.

    node scripts/forge-onchain.mjs "Player defeated the Ashfall Dragon solo at level 12"

  This is the honest end-to-end test. It exercises, on-chain:
    · ItemForge.forge_item          [INTELLIGENT]
    · gl.ContractAt(registry).view().get_game_ruleset(...)   cross-contract read
    · gl.nondet.exec_prompt(...)                             a real validator LLM
    · gl.eq_principle.prompt_comparative(...)                Optimistic Democracy
    · gl.ContractAt(registry).emit().mint_item(...)          cross-contract write
      (which only succeeds if ItemForge is actually authorized on the registry)

  If this mints an item, every one of those is working.
*/

import { TransactionStatus } from "genlayer-js/types";
import { loadDeployments, makeClient, read, send, sleep } from "./genlayer.mjs";

const { contracts } = loadDeployments();
const { client } = makeClient();

const eventContext =
  process.argv[2] ??
  "Player defeated the Ashfall Dragon solo at level 12 without taking a single hit.";

const before = Number(await read(client, contracts.ItemRegistry, "get_item_count"));
console.log(`\nitems in registry before: ${before}`);
console.log(`event: ${eventContext}\n`);

console.log("calling ItemForge.forge_item — validators are running the LLM ...");

// send() retries: a fresh write reverts while a previous one is still settling,
// and it asserts on the execution result, so a contract that threw under
// unanimous consensus is reported as the failure it is.
const receipt = await send(
  client,
  {
    address: contracts.ItemForge,
    functionName: "forge_item",
    args: ["emberfall", eventContext],
  },
  8,
);

console.log(
  "consensus:",
  receipt?.statusName,
  "| validators:",
  receipt?.resultName ?? "-",
  "| execution:",
  receipt?.txExecutionResultName ?? "-",
);

/*
  The forge emits mint_item on="accepted", so the registry is written once the
  emitted sub-transaction reaches consensus — no finalization to trigger. That
  sub-transaction is itself a write that has to be accepted, so the item count
  lags the forge by one short consensus round; poll until it lands.
*/
console.log(`\ntx ${receipt?.txId ?? receipt?.tx_id}`);
console.log("forge accepted — waiting for the emitted mint to reach consensus ...");

const deadline = Date.now() + 8 * 60 * 1000;
let after = before;

while (Date.now() < deadline && after === before) {
  await sleep(12000);
  after = Number(await read(client, contracts.ItemRegistry, "get_item_count"));
  console.log(`  items ${after}`);
}

console.log(`\nitems in registry after: ${after}`);

if (after <= before) {
  throw new Error(
    "consensus succeeded but nothing was minted — check that ItemForge is authorized",
  );
}

const item = JSON.parse(
  await read(client, contracts.ItemRegistry, "get_item", [after - 1]),
);

console.log("\n=== MINTED ON-CHAIN, BY VALIDATOR CONSENSUS ===");
console.log("name       :", item.canonical_name);
console.log("power tier :", item.power_tier, "|", item.rarity);
console.log("origin     :", item.origin_game);
console.log("owner      :", item.owner);
console.log("\ndescriptor :", item.semantic_descriptor);
console.log("\nlore       :", item.lore);
console.log();
