/*
  Authorize the Intelligent Contracts to write to the registry.

    node scripts/authorize.mjs                       # all three
    node scripts/authorize.mjs TranslationEngine EvolutionTracker

  Split out of deploy.mjs so a network blip part-way through the wiring does not
  cost you the whole deployment. set_authorized is idempotent on-chain, so this is
  safe to re-run.
*/

import { addr, loadDeployments, makeClient, read, send } from "./genlayer.mjs";

const { contracts } = loadDeployments();
const { client } = makeClient();
const registry = contracts.ItemRegistry;

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["ItemForge", "TranslationEngine", "EvolutionTracker"];

console.log(`\nregistry ${registry}\n`);

for (const name of names) {
  const address = contracts[name];
  if (!address) throw new Error(`unknown contract: ${name}`);

  process.stdout.write(`  set_authorized(${name}) ... `);
  await send(client, {
    address: registry,
    functionName: "set_authorized",
    // An Address parameter. A bare hex string would arrive as a str and the
    // transaction would die inside the GenVM after reaching consensus.
    args: [addr(address), true],
  });
  console.log("ok");
}

const games = JSON.parse(await read(client, registry, "get_games"));
console.log(`\n  games on-chain : ${games.map((g) => g.game_id).join(", ")}`);
console.log(`  item count     : ${await read(client, registry, "get_item_count")}\n`);
