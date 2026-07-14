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
  The forge emits mint_item with emit()'s default on="finalized": the registry is
  only written once THIS transaction finalizes — once the appeal window has closed
  and the forge can no longer be overturned.

  Finalization is PERMISSIONLESS AND MUST BE TRIGGERED. The chain does not
  finalize an accepted transaction on a timer; someone has to call
  finalizeTransaction once canFinalize() says the window is closed. In production
  that is a keeper; here, we do it ourselves. Nothing mints until it happens.
*/
const txId = receipt?.txId ?? receipt?.tx_id;
console.log(`\ntx ${txId}`);
console.log("waiting for the appeal window to close, then finalizing ...");

const deadline = Date.now() + 15 * 60 * 1000;
let after = before;
let finalized = false;

while (Date.now() < deadline && after === before) {
  await sleep(12000);

  try {
    if (!finalized && (await client.canFinalize({ txId }))) {
      process.stdout.write("  appeal window closed — finalizing ... ");
      await client.finalizeTransaction({ txId });
      finalized = true;
      console.log("submitted");
    }
  } catch (err) {
    // Another party may have finalized it first, or the RPC blipped. Either is fine.
    if (!/already|finalized/i.test(String(err.message))) {
      process.stdout.write("~");
    }
  }

  let status = "?";
  try {
    status = (await client.getTransaction({ hash: txId }))?.statusName ?? "?";
  } catch {
    /* transport blip — the chain does not care that we lost the connection */
  }

  after = Number(await read(client, contracts.ItemRegistry, "get_item_count"));
  console.log(`  status ${String(status).padEnd(10)} items ${after}`);
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
