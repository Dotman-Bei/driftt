/*
  Deploy and wire Driftt's Intelligent Contracts.

    node scripts/deploy.mjs            # full deploy
    node scripts/deploy.mjs --reuse-registry   # keep the existing ItemRegistry

  Reads GENLAYER_PRIVATE_KEY from ../.env; writes contracts/deployments.json and
  web/.env.local, which is what flips the frontend from simulated consensus to the
  live chain.

  Uses genlayer-js, not genlayer-py: genlayer-py 0.18.0 ships a consensus-contract
  ABI that no longer matches the one deployed on the testnet, so its receipt
  decoder dies on transactions the chain has actually accepted.
*/

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  CONTRACTS_DIR,
  ROOT,
  addr,
  deployContract,
  loadDeployments,
  makeClient,
  read,
  send,
} from "./genlayer.mjs";

const reuseRegistry = process.argv.includes("--reuse-registry");
const { account, client } = makeClient();
const RULESETS = JSON.parse(
  readFileSync(resolve(ROOT, "web", "scripts", "rulesets.json"), "utf8"),
);

console.log(`\nDriftt -> GenLayer testnet`);
console.log(`deployer ${account.address}\n`);

/* ---------------------------------------------------------------- registry */

let registry;
if (reuseRegistry) {
  registry = loadDeployments().contracts.ItemRegistry;
  const count = await read(client, registry, "get_item_count");
  console.log(`  reusing ItemRegistry ${registry} (${count} items)`);
} else {
  process.stdout.write("  deploying ItemRegistry ... ");
  registry = await deployContract(client, "item_registry.py", []);
  console.log(registry);
}

/* ------------------------------------------------- intelligent contracts --
   Every one of these takes the registry as an `Address` in __init__. Passing the
   bare hex string encodes it as a str and the constructor dies inside the GenVM,
   leaving no contract at the returned address — so it must be wrapped.        */

const registryArg = addr(registry);

/*
  REUSE=ItemForge,EvolutionTracker skips redeploying those and takes their current
  address from deployments.json. The public RPC drops connections often enough that
  a four-contract deploy regularly dies part-way through; without this, every retry
  redeploys the contracts that already succeeded.
*/
const reuse = new Set((process.env.REUSE ?? "").split(",").filter(Boolean));
const known = loadDeployments().contracts;

async function contractFor(name, file) {
  if (reuse.has(name)) {
    console.log(`  reusing ${name} ${known[name]}`);
    return known[name];
  }
  process.stdout.write(`  deploying ${name} ... `);
  const address = await deployContract(client, file, [registryArg]);
  console.log(address);
  return address;
}

const forge = await contractFor("ItemForge", "item_forge.py");
const translator = await contractFor("TranslationEngine", "translation_engine.py");
const evolver = await contractFor("EvolutionTracker", "evolution_tracker.py");

/* ------------------------------------------------------------------ wiring */

console.log("\nauthorizing the Intelligent Contracts to write to the registry");
for (const [name, address] of [
  ["ItemForge", forge],
  ["TranslationEngine", translator],
  ["EvolutionTracker", evolver],
]) {
  process.stdout.write(`  set_authorized(${name}) ... `);
  await send(client, {
    address: registry,
    functionName: "set_authorized",
    args: [addr(address), true], // Address again — same trap
  });
  console.log("ok");
}

console.log("\nregistering games");
const already = JSON.parse((await read(client, registry, "get_games")) || "[]").map(
  (g) => g.game_id,
);
for (const [gameId, ruleset] of Object.entries(RULESETS)) {
  if (already.includes(gameId)) {
    console.log(`  ${gameId} already registered`);
    continue;
  }
  process.stdout.write(`  register_game(${gameId}) ... `);
  await send(client, {
    address: registry,
    functionName: "register_game",
    args: [gameId, ruleset],
  });
  console.log("ok");
}

/* ------------------------------------------------------------ verification */

console.log("\nverifying every contract answers a view call");
const contracts = {
  ItemRegistry: registry,
  ItemForge: forge,
  TranslationEngine: translator,
  EvolutionTracker: evolver,
};
const probes = {
  ItemRegistry: ["get_item_count", []],
  ItemForge: ["get_forged_count", []],
  TranslationEngine: ["get_translation_count", []],
  EvolutionTracker: ["get_times_evolved", [0]],
};
for (const [name, address] of Object.entries(contracts)) {
  const [fn, args] = probes[name];
  const value = await read(client, address, fn, args);
  console.log(`  ${name.padEnd(18)} ${address}  ${fn} => ${value}`);
}

const games = JSON.parse(await read(client, registry, "get_games"));
console.log(`  games on-chain     ${games.map((g) => g.game_id).join(", ")}`);

/* --------------------------------------------------------------- persistence */

const chainName = process.env.GENLAYER_CHAIN ?? "testnet-bradbury";
const chainMeta = {
  "testnet-bradbury": { chain_id: 4221, rpc: "https://rpc-bradbury.genlayer.com" },
  studionet: { chain_id: 61999, rpc: "https://studio.genlayer.com/api" },
  localnet: { chain_id: 61127, rpc: "http://127.0.0.1:4000/api" },
}[chainName] ?? {};

writeFileSync(
  resolve(CONTRACTS_DIR, "deployments.json"),
  JSON.stringify(
    { chain: chainName, ...chainMeta, deployer: account.address, contracts },
    null,
    2,
  ) + "\n",
);

const envLocal = resolve(ROOT, "web", ".env.local");
const lines = new Map();
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) lines.set(m[1], m[2]);
  }
}
lines.set("NEXT_PUBLIC_GENLAYER_CHAIN", chainName);
lines.set("NEXT_PUBLIC_ITEM_REGISTRY", registry);
lines.set("NEXT_PUBLIC_ITEM_FORGE", forge);
lines.set("NEXT_PUBLIC_TRANSLATION_ENGINE", translator);
lines.set("NEXT_PUBLIC_EVOLUTION_TRACKER", evolver);
writeFileSync(envLocal, [...lines].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

console.log("\nwrote contracts/deployments.json and web/.env.local\n");
