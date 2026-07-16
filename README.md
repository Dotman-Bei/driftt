# Driftt

**Assets that drift freely between games.**

Driftt is a cross-game asset layer. An item you earn in a fantasy dungeon crawler can be
carried into a sci-fi twin-stick shooter, where it arrives as a real, balanced, playable
weapon — not a picture in a wallet. The translation is performed by a large language model
running *inside* a [GenLayer](https://genlayer.com) Intelligent Contract, and its fairness is
decided by decentralized validator consensus rather than a trusted server.

**Repository:** [github.com/Dotman-Bei/driftt](https://github.com/Dotman-Bei/driftt) ·
**Live contracts:** hosted GenLayer Studio ([addresses](#deployment)) ·
**Run it locally:** [Quick start](#quick-start)

---

## Table of contents

- [What Driftt does](#what-driftt-does)
- [The problem it solves](#the-problem-it-solves)
- [How the translation works](#how-the-translation-works)
- [Why consensus is the point](#why-consensus-is-the-point)
- [Architecture](#architecture)
- [Deployment & what is verified on-chain](#deployment)
- [Quick start](#quick-start)
- [How the app settles: on-chain vs simulated](#how-the-app-settles)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Engineering notes](#engineering-notes)
- [Design](#design)
- [Status & roadmap](#status--roadmap)

---

## What Driftt does

Driftt ships two deliberately different demo games and a shared, on-chain item layer between
them:

- **Emberfall** — a top-down fantasy dungeon crawler (melee combat, `ATK / DEF / ELEMENT /
  DURABILITY`).
- **Nova Drift** — a sci-fi twin-stick shooter (`DAMAGE / SHIELD / FIRE_RATE / ENERGY_TYPE /
  OVERHEAT_RISK`).

The core loop:

1. **Play** a game. Winning a fight generates a *gameplay event* — not a "mint" button.
2. **Forge.** An Intelligent Contract reads the event, designs a balanced, themed item with an
   LLM, and validators agree it is fair before it is written on-chain.
3. **Translate.** A second Intelligent Contract rebalances that item into the other game's
   ruleset — again under validator consensus.
4. **Play again** in the second game, using the translated item, which is now a functioning,
   balanced weapon in a completely different genre.

Every judgement about meaning — designing an item, translating it, evolving it — is made by an
LLM and made trustworthy by decentralized agreement. That combination is what GenLayer
uniquely enables, and it is the reason Driftt is possible at all.

---

## The problem it solves

Every "interoperable NFT" project today moves items between near-identical games, because they
all rely on a shared, hardcoded stat schema:

```
Fire Sword { attack: 50 }
```

That is meaningful in a fantasy game. It is meaningless to a space shooter, a racing game, or
anything that does not happen to have an `attack` stat. The moment two games genuinely differ,
the schema breaks and the item breaks with it.

**Driftt never moves stats. It moves meaning.** Every item stores a game-agnostic
`semantic_descriptor` — a natural-language description of what the item *is*:

> "A two-handed fire-aligned melee weapon, immensely heavy and slow to recover between strikes.
> It trades speed and safety for the ability to end a fight in one committed blow."

No numbers, no stat names. When another game imports the item, an Intelligent Contract reads
that description alongside the target game's ruleset and *reasons* about the fair equivalent.

---

## How the translation works

Here is a real translation produced by this project:

| Emberfall (origin) | | Nova Drift (translated) | |
|---|---|---|---|
| ATK | 71 | DAMAGE | 60 |
| DEF | 18 | SHIELD | 17 |
| ELEMENT | fire | ENERGY_TYPE | plasma |
| DURABILITY | 34 | OVERHEAT_RISK | 61 |
| **Power tier** | **80** | **Power tier** | **78** |

Look at what happens to `DURABILITY`. Emberfall charges that weapon for its power by making it
fragile. Nova Drift has no durability stat — so the engine rewrites the *cost* as
`OVERHEAT_RISK`, the closest thing that world has to the same idea. In the game, this is
load-bearing: hold the trigger on the translated weapon and it overheats and locks out, exactly
as its inherited fragility dictates.

That is a judgement about meaning, not arithmetic. There is no deterministic function that maps
`{ATK, DEF, ELEMENT, DURABILITY}` into `{DAMAGE, SHIELD, FIRE_RATE, ENERGY_TYPE, OVERHEAT_RISK}`
correctly, because the mapping is about semantics. **This is the part that was impossible before
GenLayer.**

---

## Why consensus is the point

If a single server decided what your item is worth in someone else's game, that server could
wreck their economy — or a malicious game could mint itself a god-weapon and carry it into a
rival's world. So in Driftt the fairness of every translation is a **decentralized decision**:

1. A **leader validator** runs the contract's LLM logic and proposes a result.
2. Every other validator **independently re-runs the same non-deterministic logic**.
3. Results are compared under GenLayer's **Equivalence Principle** — *semantic* equivalence,
   never byte equality, because LLM output legitimately varies. Driftt's principle is explicit:

   > `power_tier` within 5 points of the leader **and** within 5 of the origin tier; the same
   > stat keys at comparable magnitude; the same archetype and theme. An output that inflates
   > the item's power in the target game is **not** equivalent.

4. A **majority must agree** before anything is committed on-chain.
5. A validator that produced an overpowered item is the **outlier**, and is rejected.

On top of consensus, each contract applies a deterministic backstop — power is clamped into
`[origin − 5, origin + 5]` — so even a unanimous validator set cannot push an item past the
protocol's own balance ceiling. Consensus prevents cheating; the clamp guarantees the
invariant.

---

## Architecture

Four Intelligent Contracts, written in Python and deployed on GenLayer. The registry is the
single source of truth; the forge lives inside it so a forged item is designed *and* stored in
one transaction.

```
                 ┌──────────────────────────────────────────────────┐
                 │  ItemRegistry           [ ledger + forge ]        │
                 │  · forge_item()   [INTELLIGENT]  event → item     │
                 │  · items · rulesets · provenance · ownership      │
                 └───────▲──────────────────────────────▲───────────┘
              reads item │                               │ apply_evolution()
              + ruleset  │                               │ append_history()
              ┌──────────┴───────────────┐   ┌───────────┴──────────────┐
              │  TranslationEngine        │   │  EvolutionTracker         │
              │  request_translation()    │   │  evolve_item()            │
              │  [INTELLIGENT]            │   │  [INTELLIGENT]            │
              │  item → target ruleset    │   │  usage → bounded growth   │
              └───────────────────────────┘   └───────────────────────────┘
                    every intelligent call is settled by Optimistic Democracy
```

| Contract | Role |
|---|---|
| [`item_registry.py`](contracts/item_registry.py) | **Ledger + forge.** `forge_item` is an *intelligent* method: it reads the game's ruleset, has the LLM design a balanced item from a gameplay event, and — after validators agree — stores the item in the registry's own storage, all in one transaction. Also holds rulesets, append-only provenance, and ownership. |
| [`translation_engine.py`](contracts/translation_engine.py) | **Intelligent.** `request_translation` rebalances an item into another game's ruleset, enforcing the balance invariant by consensus and clamp. |
| [`evolution_tracker.py`](contracts/evolution_tracker.py) | **Intelligent.** `evolve_item` grows an item through use, with a hard, diminishing anti-farming ceiling. |
| [`item_forge.py`](contracts/item_forge.py) | The original standalone forge, superseded by the merged registry forge above. Kept for reference. |

**Adding a game requires no code.** A game is registered by describing its ruleset in plain
English:

> "Nova Drift is a twin-stick sci-fi space shooter… Items are described by exactly these stats:
> DAMAGE, SHIELD, FIRE_RATE, ENERGY_TYPE (plasma/laser/ion), OVERHEAT_RISK…"

That string *is* the integration. There is no SDK to implement and no shared schema to conform
to — which is the whole point.

---

## Deployment

The live application runs on **hosted GenLayer Studio** (`https://studio.genlayer.com/api`),
where the same Intelligent Contracts and Optimistic Democracy consensus execute in seconds to a
couple of minutes rather than the public testnet's slower, gas-metered rounds. This is what
makes the games playable on-chain.

| Contract | Studio address |
|---|---|
| `ItemRegistry` (forge + ledger) | `0xcE8B4E4Ee51Bb2785d5F8E49a64A41006Ca6202b` |
| `ItemForge` | `0x6C250C91B06dF6A11a6FBA17010b5c59EA441c38` |
| `TranslationEngine` | `0xF481004d37134d8c345C5A1B940d524bA13bE536` |
| `EvolutionTracker` | `0xB63A4C8a83c0B4a00EfC776c8C9E570cBC329FD3` |

> GenLayer Studio is a shared sandbox that resets periodically; when it does, the app is
> redeployed and these addresses change. The current live set is always recorded in
> [`contracts/deployments.json`](contracts/deployments.json).

### What is verified on-chain

The full loop runs against the live contracts through the app:

- **Forge.** A gameplay event → the LLM designs a balanced item, validators agree under the
  Equivalence Principle, and the item is stored — in a single transaction. Verified example:
  *"Ash-Vow Cleaver"*, tier 72 epic, unanimous validator approval, read back from the registry.
- **Translate.** The forged item → a rebalanced weapon in the target game: a fire greatsword
  becomes a plasma lance, power held within ±5 of the original, and `DURABILITY` correctly
  rewritten as `OVERHEAT_RISK`.
- **Evolve.** Bounded growth, verified against the anti-farming ceiling — a grindy event earns
  zero, a genuine feat earns a small, capped gain.

The contracts were **also deployed to and proven on the public Bradbury testnet** (chain id
`4221`, `https://rpc-bradbury.genlayer.com`), where a real forge reached **6-of-6 validator
consensus** and the item was stored on-chain (`item_count` 0 → 1, read back by id and by owner;
addresses in [`contracts/deployments.testnet.json`](contracts/deployments.testnet.json)). The
public testnet is durable but slower, so it stands as the "deployed on a public network" proof
while Studio hosts the fast, playable app.

Redeploy to either network:

```bash
GENLAYER_CHAIN=studionet       node web/scripts/deploy.mjs   # hosted Studio (default app chain)
GENLAYER_CHAIN=testnet-bradbury node web/scripts/deploy.mjs   # public testnet
```

Each run deploys all contracts, authorizes the translation/evolution methods on the registry,
registers both games' rulesets, and rewrites `web/.env.local`.

---

## Quick start

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

The app works immediately, with no wallet, no funded account, and no deployment — it falls back
to a local, in-browser implementation of the same consensus logic (see
[below](#how-the-app-settles)). To run it fully on-chain, point it at the deployed contracts by
setting the values in `web/.env.local` (written for you by the deploy script) plus a
`GENLAYER_PRIVATE_KEY` for the server to sign transactions.

### Playing (2-minute tour)

1. **Play Emberfall** (`WASD` to move, `Space` to swing). Clear the room and kill the Ashfall
   Dragon.
2. **The forge fires automatically.** No manual minting — the contract designs the item from
   what you actually did, and you watch the validators agree it is fairly balanced.
3. **Open the item → "Translate to Nova Drift."** A side-by-side panel shows the sword on the
   left and the weapon it becomes on the right; a consensus pulse runs between them and resolves
   into *"validators agreed — balance approved."*
4. **Switch to Nova Drift and fire it.** The translated weapon is in the rack; hold the trigger
   and it overheats exactly as its balance cost dictates.
5. **Open the item's provenance** — one item, two games, the full journey on record.

---

## How the app settles

Gameplay (moving, fighting) is always instant and local. What varies is where the two
**deliberate moments** — forging on a kill, translating into another game — are settled.

**On-chain (default, contracts configured).** The `/api/forge` and `/api/translate` routes
submit real transactions to the deployed Intelligent Contracts, server-side. The browser needs
no wallet: the server relays and pays gas, and the player's address is passed through so the
item is still owned by the player. Each of these moments runs the LLM on every validator and
waits for agreement, so it takes tens of seconds to a couple of minutes and shows a "forging on
GenLayer" state; the returned consensus data is real, and the inventory reads items straight
from the on-chain registry.

**Graceful fallback.** Studio is a shared sandbox — it can be slow or reset. If an on-chain call
does not commit within a bounded time budget, the routes fall back to the local consensus
engine so a player is **never dead-ended**. The response reports which path produced the item,
so the UI never misrepresents where consensus ran.

**Simulated (no key).** With no deployer key, the same leader / validator / equivalence-principle
/ appeal machinery in [`web/src/lib/oracle.ts`](web/src/lib/oracle.ts) executes in the browser —
instant, free, and identical in shape to the on-chain result. Without an `ANTHROPIC_API_KEY`,
each validator runs an independently-seeded offline generator instead of an LLM (so they still
produce different results and the Equivalence Principle still does real work). Add a key to run
genuine LLM reasoning locally:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> web/.env.local
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Intelligent Contracts | Python on GenLayer (`gl.nondet.exec_prompt`, `gl.eq_principle.prompt_comparative`, `TreeMap` / `DynArray` / `u256` storage, cross-contract `get_contract_at`) |
| Chain SDK | [`genlayer-js`](https://www.npmjs.com/package/genlayer-js) (viem-based) |
| Frontend | Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 |
| LLM | Anthropic Claude (`claude-opus-4-8`) via the official SDK, used both on-chain (validators) and in the local fallback |
| Games | Hand-written HTML canvas — no game engine dependency |

---

## Project structure

```
contracts/
  item_registry.py          ledger + intelligent forge_item (LLM → consensus → store)
  translation_engine.py     [INTELLIGENT] item → another game's ruleset
  evolution_tracker.py      [INTELLIGENT] use → bounded growth
  item_forge.py             original standalone forge (superseded, kept for reference)
  rulesets.py               the two games, described in English
  deployments.json          the current live (Studio) addresses
  deployments.testnet.json  the public-testnet addresses (durable proof)

web/
  scripts/deploy.mjs        deployer + wiring + ruleset registration (genlayer-js)
  scripts/genlayer.mjs      address encoding, retries, execution-result checks
  scripts/forge-onchain.mjs drive a forge through live validators from the CLI
  src/lib/serverChain.ts    server-side on-chain path used by the API routes
  src/lib/oracle.ts         local consensus engine (leader, validators, appeals)
  src/lib/store.ts          inventory, provenance, translations
  src/app/api/              forge · translate · evolve · items (route handlers)
  src/app/games/            Emberfall + Nova Drift pages
  src/components/games/     the two canvas games, no engine dependency
```

---

## Engineering notes

Building against a live GenLayer network surfaced three failure modes that are worth recording,
because each one fails *silently*:

1. **`genlayer-py` could not read the target chain.** Both SDKs read receipts via
   `getTransactionData` on the consensus contract, and the ABI shipped by `genlayer-py` 0.18.0
   no longer matched the deployed contract — its decoder threw on transactions the chain had
   already accepted. `genlayer-js` decodes correctly, so the deployer is Node, not Python.

2. **Address arguments must be wrapped in `CalldataAddress`.** A bare `"0x…"` string is encoded
   into calldata as a *string*; a method that declares `Address` then receives a `str` and dies
   inside the GenVM. This silently produced "deployed" contracts with no code behind them until
   the encoding was fixed.

3. **Consensus succeeding is not the contract succeeding.** A transaction reaches `ACCEPTED`
   with `AGREE` when validators unanimously agree — *including when they agree that the contract
   threw*. That only shows up in `txExecutionResult` as `FINISHED_WITH_ERROR`. Every write in
   this repo asserts on the execution result, not just the consensus status.

A fourth lesson shaped the architecture: emitting a cross-contract `mint_item` message only
dispatches at *finalization*, which is not reliably triggerable on these networks. Merging the
forge into the registry — so `forge_item` designs *and* stores the item in one transaction —
is what makes an on-chain forge actually complete. Contracts also normalize LLM output
(deriving rarity from the power band, clamping power, reading every field defensively) rather
than asserting on it, so a single unlucky sample never discards a consensus-approved item.

---

## Design

The frontend follows an editorial design system built on GenLayer's official "Autonomous Core"
brand palette. The accent budget *is* the design: Kinetic Cobalt (`#110FFF`) appears only two or
three times per page and never at rest — it arrives on intent (a hover, or the "system is
thinking" consensus pulse). Success green (`#00FF66`) appears only as the payoff, when
validators approve. Rarity is mapped onto the brand's neutral ramp rather than inventing gem
colours. Buttons shrink on hover, never grow. The interface is responsive across screen sizes,
with a dedicated mobile navigation.

---

## Status & roadmap

**Working today:** four contracts deployed on GenLayer (Studio + public testnet); the full
forge → translate → evolve loop on-chain through the app, with a graceful local fallback; two
playable games; on-chain inventory and provenance; a responsive UI.

**Verified clean:** `npm run build`, `tsc --noEmit`, and `eslint` all pass.

**Roadmap:** a guided objective to give the loop an explicit goal; a third game in a different
genre (e.g. racing) to prove the translation engine generalizes beyond fantasy ↔ sci-fi; a
peer-to-peer marketplace for cross-game items; and a player reputation score that travels with
provenance.
