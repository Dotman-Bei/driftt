# Driftt — assets that drift freely between games

Driftt is a cross-game asset layer. An item you earn in a fantasy dungeon crawler can be
carried into a sci-fi twin-stick shooter, where it arrives as a real, balanced, playable
weapon — not a picture in a wallet.

The translation is done by an LLM running inside a GenLayer **Intelligent Contract**, and
its fairness is decided by **validator consensus**, not by a server.

---

## The problem this solves

Every "interoperable NFT" project today moves items between near-identical games, because
they all rely on a shared, hardcoded stat schema.

```
Fire Sword { attack: 50 }
```

That is meaningful in a fantasy game. It is meaningless to a space shooter, a racing game,
or anything that does not happen to have an `attack` stat. The moment two games genuinely
differ, the schema breaks and the item breaks with it.

**Driftt never moves stats. It moves meaning.**

Every item stores a game-agnostic `semantic_descriptor` — a natural-language description of
what the item *is*:

> "A two-handed fire-aligned melee weapon, immensely heavy and slow to recover between
> strikes. It trades speed and safety for the ability to end a fight in one committed blow."

No numbers. No stat names. When another game imports the item, an Intelligent Contract reads
that description alongside the target game's ruleset and **reasons** about the fair
equivalent.

Here is a real translation produced by this repo:

| Emberfall (origin) | | Nova Drift (translated) | |
|---|---|---|---|
| ATK | 71 | DAMAGE | 60 |
| DEF | 18 | SHIELD | 17 |
| ELEMENT | fire | ENERGY_TYPE | plasma |
| DURABILITY | 34 | OVERHEAT_RISK | 61 |
| **Power tier** | **80** | **Power tier** | **78** |

Look at what happened to `DURABILITY`. Emberfall charges that weapon for its power by making
it fragile. Nova Drift has no durability stat — so the engine rewrote the *cost* as
`OVERHEAT_RISK`, the closest thing that world has to the same idea.

That is a judgement about meaning, not arithmetic. There is no Solidity function that does
it. **This is the part that was impossible before GenLayer.**

---

## Why consensus is the point, not decoration

If one server decided what your item is worth in someone else's game, that server could
wreck their economy — or a malicious game could mint itself a god-weapon and carry it into a
rival's world.

So the fairness of every translation is a **decentralized decision**:

1. A **leader validator** runs the Intelligent Contract's LLM logic and proposes a result.
2. Every other validator **independently re-runs the same non-deterministic logic**.
3. They compare under the **Equivalence Principle** — *semantic* equivalence, never byte
   equality, because LLM output legitimately varies. Driftt's principle is explicit:

   > power_tier within 5 points of the leader **and** within 5 of the origin tier; same stat
   > keys at comparable magnitude; same archetype and theme. An output that inflates the
   > item's power in the target game is **not** equivalent.

4. A **majority must agree** before anything is committed.
5. A validator that produced an overpowered item is the **outlier**. The dispute escalates
   through **appeals** to a larger validator set, and the outlier is rejected.

On top of consensus there is a deterministic backstop: `assert abs(power - origin_power) <= 5`.
Even a unanimous validator set cannot talk an overpowered item past the protocol's own ceiling.

---

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │  ItemRegistry.py   (deterministic)   │
                    │  the universal source of truth       │
                    │  · items, rulesets, provenance       │
                    └───────▲──────────▲──────────▲────────┘
                            │          │          │
              mint_item()   │          │          │  apply_evolution()
                            │          │          │
        ┌───────────────────┴──┐  ┌────┴───────┐  └──┬────────────────────┐
        │  ItemForge.py        │  │Translation │     │ EvolutionTracker.py│
        │  [INTELLIGENT]       │  │Engine.py   │     │ [INTELLIGENT]      │
        │                      │  │[INTELLIGENT│     │                    │
        │  gameplay event      │  │            │     │  usage event       │
        │       ↓ LLM          │  │  item +    │     │       ↓ LLM        │
        │  balanced item       │  │  ruleset   │     │  bounded growth    │
        │                      │  │    ↓ LLM   │     │                    │
        │                      │  │ rebalanced │     │                    │
        └──────────────────────┘  └────────────┘     └────────────────────┘
                    every one settled by Optimistic Democracy
```

| Contract | Kind | What it does |
|---|---|---|
| `contracts/item_registry.py` | deterministic | Canonical ledger. Stores the semantic descriptor, power tier, lore, and append-only provenance. Holds no LLM logic — it is what the Intelligent Contracts write into *after* consensus. |
| `contracts/item_forge.py` | **intelligent** | Turns a gameplay event into a balanced, themed item. `gl.eq_principle.prompt_comparative` |
| `contracts/translation_engine.py` | **intelligent** | The killer feature. Rebalances an item into another game's ruleset. `gl.eq_principle.prompt_comparative` |
| `contracts/evolution_tracker.py` | **intelligent** | Items grow through use, with a hard anti-farming ceiling. `gl.eq_principle.prompt_comparative` |

Adding a game to the network requires **no code**. You register a ruleset written in English:

> "Nova Drift is a twin-stick sci-fi space shooter… Items are described by exactly these
> stats: DAMAGE, SHIELD, FIRE_RATE, ENERGY_TYPE (plasma/laser/ion), OVERHEAT_RISK…"

That string *is* the integration.

---

## Deployed contracts

Live on the GenLayer testnet (chain id `4221`, via `https://rpc-bradbury.genlayer.com`):

| Contract | Address |
|---|---|
| `ItemRegistry` | `0x7CFaB40bbA3b45b67762C897426d813C7BCA2bC3` |
| `ItemForge` | `0x25c9afC1FAE50c5C5a42B88Faf7BB1d0cc982285` |
| `TranslationEngine` | `0xA27382DEB028640dC162A9f4f8843564201F529A` |
| `EvolutionTracker` | `0x681f4610F0f6C0169942909ab3dA0220853f4552` |

Both games' rulesets are registered on-chain in the registry. Redeploy with:

```bash
node web/scripts/deploy.mjs             # deploys, wires, registers, writes web/.env.local
node web/scripts/authorize.mjs          # re-run just the wiring, idempotent
node web/scripts/forge-onchain.mjs "…"  # run a real forge through live validators
```

### Three things the live chain taught us

Written down because all three are silent failures, and each one cost real time.

**1. `genlayer-py` cannot read this chain.** Both SDKs read receipts by calling
`getTransactionData` on the consensus contract, and the ABI `genlayer-py` 0.18.0 ships no
longer matches what is deployed — its decoder throws on transactions the chain has already
*accepted*. `genlayer-js` decodes correctly, so the deployer is Node, not Python.
`deploy.py` is kept only as a reference and does not work against this network.

**2. Address arguments must be wrapped in `CalldataAddress`.** A bare `"0x…"` string is
encoded into calldata as a **string**. A contract method that declares `Address` then
receives a `str`, and the transaction dies inside the GenVM. This silently destroyed the
first three deploys: they returned plausible-looking addresses with no code behind them.

**3. Consensus succeeding is not the contract succeeding.** A transaction reaches
`ACCEPTED` with result `AGREE` when the validators unanimously agree — *including when they
unanimously agree that the contract threw*. That only appears in `txExecutionResult`, as
`FINISHED_WITH_ERROR`. Any check that looks at the consensus status alone will report a
failed forge as a success. Every write in this repo asserts on the execution result.

Two consequences for the UI: wait for `ACCEPTED`, not `FINALIZED` (which lands minutes
later, after the appeal window), and space out consecutive writes to the same contract —
the consensus contract reverts a second write while the first is still settling.

---

## Running it

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

It works immediately, with no wallet, no funded account, and no deployment.

### The two modes

Driftt runs in one of two modes, and the difference is one environment variable.

**Simulated consensus (default).** With no contract addresses configured, the leader /
validator / equivalence-principle / appeal machinery in [`web/src/lib/oracle.ts`](web/src/lib/oracle.ts)
executes off-chain and settles in the browser. This is the real consensus logic — three
validators genuinely run independently and can genuinely disagree — it just is not
settled on a blockchain.

Without an `ANTHROPIC_API_KEY`, each validator runs a **seeded offline generator** instead of
an LLM. Each validator is seeded differently, so they still produce independent, slightly
different results, and the equivalence principle still does real work. Set the key to run
genuine LLM reasoning:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > web/.env.local
```

**Live chain.** The contracts above are already deployed, and `web/.env.local` already
points at them — so the frontend reads and writes real Intelligent Contracts, with consensus
executed by real GenLayer validators. To deploy your own set:

```bash
echo "GENLAYER_PRIVATE_KEY=0x..." > .env    # fund it at testnet-faucet.genlayer.foundation
node web/scripts/deploy.mjs
```

That deploys all four contracts, authorizes the three Intelligent Contracts to write to the
registry, registers both games' rulesets, and rewrites `web/.env.local`. The frontend
switches over with no code change.

Expect the live path to be **slow**: every intelligent method runs an LLM on each validator
and then waits for them to agree, so a forge or a translation takes on the order of a minute
or two, and a write issued while the previous one is still settling will revert and need a
retry. The simulated mode has neither problem, which is why it stays the default.

---

## The demo

1. **Play Emberfall.** Clear the vault, kill the Ashfall Dragon. (`WASD`, `Space` to swing.)
2. **The forge fires automatically.** No manual minting — an Intelligent Contract reads what
   you actually did and designs the item. Watch three validators independently agree it is
   fairly balanced for the event.
3. **Open the item, hit "Translate to Nova Drift."** The side-by-side panel shows the sword
   on the left and the weapon it becomes on the right. The cobalt pulse in the hairline
   between them is consensus running. It resolves into
   `3 OF 3 VALIDATORS AGREED — BALANCE APPROVED`.
4. **Switch to Nova Drift and fire it.** The translated weapon is in the rack. Its `DAMAGE`,
   `FIRE_RATE` and `OVERHEAT_RISK` are the numbers the validators approved — hold the trigger
   and it overheats exactly as its balance cost says it should.
5. **Open the item's provenance.** One item, two games, the full journey on record.

---

## What is actually verified

**On-chain.** All four contracts are deployed to the live GenLayer testnet and every one
answers a view call. Both games' rulesets are stored in the registry (747 and 874 chars, read
back from the chain). Specifically, the following were exercised against the live contracts:

- **`ItemForge.forge_item` runs the LLM under consensus.** Real validators executed the
  non-deterministic method, agreed under the Equivalence Principle (`result: AGREE`,
  `FINISHED_WITH_RETURN`), and the contract's `forged_count` incremented. The emitted
  `mint_item` message carried the model's actual output — a "Cinderbrand" fire longsword —
  proving the AI generation happened on-chain, not off it.
- **`ItemForge` reads the registry cross-contract.** `forge_item` loads the target game's
  ruleset via `get_contract_at(registry).view().get_game_ruleset(...)` — a real
  contract-to-contract call inside the intelligent method.
- **`ItemRegistry` stores and serves items.** A `mint_item` call took the registry's
  `item_count` from 0 to 1; the item reads back by id, by owner (`get_items_by_owner`), and
  in the activity log. Item 0 ("Cinderbrand", epic, tier 72) is on the chain now.

**One thing does not complete on this testnet: the automatic hop from forge to registry.**
`forge_item` emits `mint_item` for the registry to execute, but on this network an emitted
cross-contract message is only dispatched when the emitting transaction *finalizes*, and
finalization is not currently triggerable here — the consensus contract's `canFinalize`
reverts indefinitely after acceptance. So the forge's own auto-mint is stuck behind that,
even though every piece of it (LLM, consensus, the emitted message with real data, and the
registry's ability to store the item) is independently proven above. The `web/scripts`
demonstrate each half against the live chain: `forge-onchain.mjs` (the intelligent forge) and
`mint-onchain.mjs` (the registry write).

**Off-chain**, end-to-end against the local server with the offline generator:

- **Forge.** Event → item. Three validators independently produced power tiers **80 / 81 / 79**
  and agreed. Rarity is derived from the tier band, not asserted by the model.
- **Translate.** Tier-80 greatsword → `Pyre-Tempered Plasma Lance`, tier **78**, drift **−2**.
  Nova Drift's exact stat keys, `DURABILITY` correctly rewritten as `OVERHEAT_RISK 61`.
- **Balance invariant.** A tier-95 item translates to tier 96 — drift **+1**. The
  `|drift| ≤ 5` invariant holds at the ceiling.
- **Anti-farming.** "Repeatedly farmed the same training dummy" → **+0** power. "Destroyed 100
  hostiles solo, flawless" → **+4**. The ceiling shrinks each time an item evolves.

`npm run build`, `tsc --noEmit`, and `eslint` are all clean.

**Not yet verified:** a full on-chain forge → translate round trip that mints into the
registry and rebalances across games. The contracts, the consensus, and the cross-contract
reads are all confirmed working on the live chain; what has not yet been demonstrated
end-to-end on-chain is the mint itself. The LLM validator path in `lib/oracle.ts` is written
against the verified Anthropic API but has so far only been exercised through the offline
generator — set `ANTHROPIC_API_KEY` to run it for real.

---

## Design

The frontend follows the **Editorial Landing Page Playbook**, with GenLayer's official
"Autonomous Core" brand palette in the playbook's colour slots.

| Slot | Hex | GenLayer name | Role |
|---|---|---|---|
| bg | `#070707` | Carbon Void | Page background |
| surface | `#141414` | derived | Cards, inputs |
| border | `#303030` | Graphite | Hairlines, dividers |
| text-1 | `#F5F5F5` | Ceramic Node | Headlines |
| text-2 | `#CACACA` | Chassis | Body |
| text-3 | `#606060` | Asphalt | Eyebrows, meta |
| accent | `#110FFF` | Kinetic Cobalt | **Precious.** 2–3 uses per page |
| signal | `#00FF66` | Success | **The payoff.** 1–2 uses, consensus approved |
| error | `#FF2B2B` | Error | Functional only |

The accent budget *is* the design. Cobalt appears twice at rest on the landing page — the
glow word in the hero, and the consensus pulse — plus the CTA, which is neutral at rest and
flips to cobalt on hover, so the accent arrives on **intent**. Success green appears exactly
once, and only when validators approve. Rarity is mapped onto the brand ramp rather than
inventing gem colours, which is the fastest way to look like every other NFT project.

Buttons shrink on hover. Never grow.

The GenLayer mark is the official asset, unmodified, and is the one place pure white is
correct.

---

## Layout

```
contracts/
  item_registry.py         deterministic ledger
  item_forge.py            [INTELLIGENT] event -> item
  translation_engine.py    [INTELLIGENT] item -> another game's ruleset
  evolution_tracker.py     [INTELLIGENT] use -> bounded growth
  rulesets.py              the two games, in English
  deployments.json         the live addresses
deploy.py                  reference only — genlayer-py cannot read this chain
web/
  scripts/deploy.mjs       the real deployer (genlayer-js)
  scripts/authorize.mjs    re-runnable wiring
  scripts/forge-onchain.mjs   forge through live validators
  scripts/genlayer.mjs     address encoding + execution-result checks
  src/lib/oracle.ts        the consensus engine (leader, validators, appeals)
  src/lib/chain.ts         genlayer-js path, used when contracts are deployed
  src/lib/store.ts         inventory, provenance, translations
  src/components/games/    Emberfall + Nova Drift, canvas, no engine dependency
  src/app/                 landing, inventory, translate, forge, games
```
