# Driftt

**Assets that drift freely between games.**

Driftt is a cross-game asset layer built on [GenLayer](https://genlayer.com). An item you earn in
a fantasy dungeon crawler can be carried into a sci-fi space shooter, where it arrives as a real,
balanced, playable weapon — not a picture in a wallet.

The translation is performed by a large language model running *inside* an Intelligent Contract,
and its fairness is decided by decentralized validator consensus rather than by a trusted server.

---

## 1. The problem

### Game items are trapped

You can spend a hundred hours earning a legendary sword. It exists in exactly one game. When you
stop playing, it stops existing. Every hour of that effort is stranded inside one studio's
database.

"Interoperable NFTs" were supposed to fix this. They did not. Look closely at any working example
and you find the same trick: the games are near-identical, and they share a hardcoded stat schema.

```
Fire Sword { attack: 50 }
```

That is meaningful in a fantasy RPG. It is **meaningless** to a space shooter, a racing game, or
anything that does not happen to have an `attack` stat. The moment two games genuinely differ, the
schema breaks and the item breaks with it. So in practice, items only travel between games that
were already the same game.

### The real blocker is meaning, not tokens

Moving an item between genuinely different games is not a data-format problem. It is a **judgement
about meaning**.

Take a real case from this project. Emberfall is a melee dungeon crawler; its weapons are described
by `ATK / DEF / ELEMENT / DURABILITY`. Nova Drift is a twin-stick space shooter; its weapons are
described by `DAMAGE / SHIELD / FIRE_RATE / ENERGY_TYPE / OVERHEAT_RISK`.

Nova Drift has **no durability stat**. So what happens to a greatsword that was deliberately made
fragile as the price of its power?

There is no deterministic function that answers this. You cannot write it in Solidity. Answering it
requires understanding that Emberfall charged the weapon for its power by making it break, that
Nova Drift's equivalent cost is heat, and that the honest translation is therefore
`DURABILITY → OVERHEAT_RISK`. That is reasoning, not arithmetic.

### And you cannot let one server decide

Suppose you solve the meaning problem with an off-chain AI service. Now a single server decides
what your item is worth inside someone else's game. That server can quietly wreck a studio's
economy. Worse, a malicious game can mint itself a god-weapon and carry it into a rival's world.

No studio will accept foreign items on those terms — and they are right not to.

### The deadlock

So cross-game assets need two things that, until now, could not coexist:

| Requirement | Why it's needed | Why it was impossible |
|---|---|---|
| **Subjective judgement** | Translating meaning across genres is not computable | Blockchains are deterministic; they cannot reason |
| **Trustless settlement** | Nobody will let a rival's server value their economy | AI services are centralized by construction |

GenLayer is the first chain where both hold at the same time. That is the reason Driftt exists.

---

## 2. The solution

**Driftt never moves stats. It moves meaning.**

Every item is stored game-agnostically. Its core field is a `semantic_descriptor` — a natural
language description of what the item *is*, containing **no numbers and no stat names**:

> "A two-handed fire-aligned melee weapon, immensely heavy and slow to recover between strikes.
> It trades speed and safety for the ability to end a fight in one committed blow."

When another game imports the item, an Intelligent Contract reads that description alongside the
target game's ruleset and *reasons* about the fair equivalent — then validators independently
re-run that reasoning and must agree the result is balanced before it is written on-chain.

Here is a real translation produced by this system:

| Emberfall (origin) | | Nova Drift (translated) | |
|---|---|---|---|
| ATK | 71 | DAMAGE | 60 |
| DEF | 18 | SHIELD | 17 |
| ELEMENT | fire | ENERGY_TYPE | plasma |
| DURABILITY | 34 | OVERHEAT_RISK | 61 |
| **Power tier** | **80** | **Power tier** | **78** |

The fragility became heat. And this is not cosmetic: in Nova Drift, holding the trigger on that
translated weapon overheats it and locks it out, exactly as its inherited fragility dictates. The
item's *cost* survived the journey between two unrelated genres.

### Why consensus is the whole point

Fairness in Driftt is a **decentralized decision**:

1. A **leader validator** runs the contract's LLM logic and proposes a result.
2. Every other validator **independently re-runs the same non-deterministic logic**.
3. Results are compared under GenLayer's **Equivalence Principle** — *semantic* equivalence, never
   byte equality, because LLM output legitimately varies. Driftt's principle is explicit:

   > `power_tier` broadly tracks the origin tier; the same stat keys the target game defines; the
   > same archetype and elemental theme. A translation that grossly inflates the item's power is
   > **not** equivalent.

4. A **majority must agree** before anything is committed on-chain.
5. A validator that produced an overpowered item is the **outlier**, and is rejected.

On top of consensus, each contract applies a **deterministic backstop**: translated power is
clamped into `[origin − 5, origin + 5]`, and evolution gains are clamped to a shrinking per-item
ceiling. So even a unanimous, fully-compromised validator set cannot push an item past the
protocol's own balance limit.

**Consensus prevents cheating. The clamp guarantees the invariant.**

---

## 3. The use case

### For a player

You clear the Ashfall Dragon in Emberfall. The kill itself forges you an item — there is no "mint"
button; the contract designs the reward from what you actually did. You open it, hit *"Translate to
Nova Drift"*, and watch validators agree the conversion is fair. You switch games, and the weapon
is in your rack — firing, overheating, and carrying its own history with it.

One item. Two unrelated games. One provenance record.

### For a game studio

**Adding a game requires no code.** A game joins the network by describing its ruleset in plain
English:

> "Nova Drift is a twin-stick sci-fi space shooter. Combat is continuous and mobile: you never stop
> moving, you never stop firing, and heat is the real enemy. Items are described by exactly these
> stats: DAMAGE, SHIELD, FIRE_RATE, ENERGY_TYPE (plasma/laser/ion), OVERHEAT_RISK…"

That string **is** the integration. There is no SDK to implement, no shared stat schema to conform
to, and no committee to negotiate a standard with — which is precisely the point. A studio does not
have to redesign its game to accept foreign items, and it does not have to trust anyone's server to
value them, because the balance guarantee is enforced by consensus and by a clamp it can read in
the contract source.

### Beyond games

The same primitive — *store meaning, translate it under consensus* — applies anywhere value must
cross incompatible systems whose mapping is subjective: reputation across platforms, credentials
across institutions, loyalty points across merchants. Games are the sharpest demo because balance
breaks loudly and immediately when a translation is wrong.

---

## 4. How it works

### The loop, at a glance

```
   ┌── 1. PLAY ─────────── Emberfall (fantasy melee)
   │                       Kill the boss → a gameplay event, not a mint button
   │
   ├── 2. FORGE ────────── ItemRegistry.forge_item()          [INTELLIGENT]
   │                       LLM designs a balanced item from the event
   │                       Validators agree it is fair → stored on-chain
   │
   ├── 3. TRANSLATE ────── TranslationEngine.request_translation()  [INTELLIGENT]
   │                       LLM rebalances it into the target game's ruleset
   │                       Validators agree + deterministic clamp → stored on-chain
   │
   ├── 4. PLAY AGAIN ───── Nova Drift (sci-fi shooter)
   │                       The translated weapon actually fires, and overheats
   │
   └── 5. EVOLVE ───────── ItemRegistry.evolve_item()         [INTELLIGENT]
                           Use grows the item, with a diminishing anti-farm ceiling
```

Every judgement about meaning — designing an item, translating it, evolving it — is made by an LLM
and made trustworthy by decentralized agreement. Here is the same loop in full detail, following
one item end to end.

---

### Step 1 — Play, and the game describes what you did

You load Emberfall and fight. `WASD` to move, `Space` to swing. Combat is deliberate: you close
distance, you commit to a swing, you get punished for it.

When you kill the Ashfall Dragon, the game does **not** show you a mint button. It writes a plain
English description of what actually happened, assembled from real match state — which boss died,
whether you were hit, which weapon you carried, how much health you finished on:

> "Player defeated the Ashfall Dragon and cleared the Cinder Vault without taking a single hit,
> wielding the Ashfall Greatsword. They finished the fight on 62 of 100 health."

This string is the **gameplay event**. It is the only input to the forge, and it is deliberately
natural language rather than a structured payload — because the contract is going to *reason* about
it, not parse it. A flawless boss kill and a tutorial-dummy kill are different sentences, and that
difference is what the reward is derived from.

> `web/src/components/games/Emberfall.tsx` → `onVictory(eventContext)`

### Step 2 — Forge: the contract designs the reward, and validators agree it is fair

The browser POSTs the event to `/api/forge` with the player's address. The server — not the browser
— signs and submits the transaction, so the player needs **no wallet and no gas**. The player's
address is passed as an explicit argument, so the item is still owned by the player rather than by
the relaying server.

```
POST /api/forge  { gameId: "emberfall", eventContext: "...", player: "0x..." }
   → ItemRegistry.forge_item(game_id, event_context, player)
```

Inside the contract:

1. **Load the target game's ruleset** from storage — the plain-English description Emberfall
   registered when it joined.
2. **Build the prompt**: the event, the ruleset, and hard design constraints — `power_tier` must be
   justified by the difficulty of the event, and the `semantic_descriptor` must contain **no numeric
   stats and no stat names**, because other games will translate the item from that description
   alone.
3. **Run it non-deterministically** via `gl.nondet.exec_prompt`, wrapped in
   `gl.eq_principle.prompt_comparative(design_item, principle=FORGE_PRINCIPLE)`.

That wrapper is where GenLayer takes over. A **leader validator** runs the prompt and proposes an
item. Every other validator **independently re-runs the same prompt** — getting different wording,
different names, different exact numbers, because LLMs vary. Their outputs are then compared under
the Equivalence Principle, which judges *meaning*, not bytes:

> `power_tier` values differ by no more than 8 · `rarity` is the same or one step apart · the same
> broad archetype and elemental theme. **Wording, names, and prose may differ freely.** An output
> whose `power_tier` is not justified by the difficulty of the event is **not** equivalent.

4. **A majority must agree** before execution continues. A validator that invented a tier-95
   god-weapon from a tutorial kill is the outlier, and is rejected.
5. **Normalize, then store.** The contract reads every field defensively, clamps power into `1–100`,
   and derives rarity from the power band (`common ≤30 < rare ≤55 < epic ≤80 < legendary`) rather
   than trusting the model's own label. Then it writes the item, appends the owner index, and
   appends a `forged` provenance entry — all to **its own storage, in the same transaction**.

The item exists on-chain the moment the transaction is accepted. The server then reads
`get_item_count` back and asserts it actually increased, so a round that reached consensus but
stored nothing is caught rather than reported as success. The UI shows the validators agreeing, then
**"Settled on GenLayer ✓"** with the transaction id.

> `contracts/item_registry.py` → `forge_item` · `web/src/lib/serverChain.ts` → `forgeOnChain`

### Step 3 — Translate: the same item, rebalanced for a different genre

You open the item and hit **"Translate to Nova Drift."**

```
POST /api/translate  { itemId, targetGame: "nova-drift" }
   → TranslationEngine.request_translation(item_id, target_game)
```

The `TranslationEngine` is a **separate contract** that reads from the registry cross-contract. It
pulls three things: the item, the **origin** game's ruleset, and the **target** game's ruleset. It
refuses if the item is already native to the target game, or has already been translated there.

Then it prompts for the fair equivalent — and note what it is *not* given. It never sees
`ATK: 71`. It sees the `semantic_descriptor`: *"a two-handed fire-aligned melee weapon, immensely
heavy and slow to recover between strikes…"* Stats do not cross the boundary. Meaning does.

The constraints are strict: use **exactly** the stat names the target ruleset defines and invent
none; preserve the archetype and elemental theme; and keep power within 5 points of the origin tier
— *"You are NOT permitted to create an item that is stronger in the target game than it was in the
origin game."*

Validators independently re-run this too, and compare under the `BALANCE_PRINCIPLE`:

> `power_tier` values within 10 of each other and broadly tracking the origin tier · the same stat
> keys the target game defines · the same archetype and elemental theme. **Only a translation that
> changes the item's kind, drops the theme, or grossly inflates its power is not equivalent.**

**Then the deterministic backstop fires.** After consensus, the contract clamps power into
`[origin − 5, origin + 5]`. This is the layer that matters most for the security story: validators
already agreed the item is fair, and the clamp guarantees that *even if every validator were
compromised and unanimously agreed on a god-weapon*, the item still cannot come out of the
translation stronger than it went in. Consensus prevents cheating; the clamp guarantees the
invariant.

The approved translation is stored in the engine's own storage under the key `"{item_id}:{target_game}"`.
The UI shows the sword on the left, the weapon it became on the right, and a consensus pulse running
between them that resolves into *"validators agreed — balance approved."*

> `contracts/translation_engine.py` → `request_translation`

### Step 4 — Play again, and the translation is load-bearing

Switch to Nova Drift. The translated weapon is in your rack — and this is where the claim gets
tested, because the translated stats are wired straight into the game loop, not into a display card.

Nova Drift reads `DAMAGE`, `SHIELD`, `FIRE_RATE`, `ENERGY_TYPE` and `OVERHEAT_RISK` off the
translation. `OVERHEAT_RISK` feeds the heat model directly: every shot adds heat scaled by that
stat, and at 100 the weapon **locks out** and you cannot fire until it cools.

So the fragility that Emberfall expressed as low `DURABILITY` — the price that weapon paid for
hitting so hard — arrives in a space shooter as a gun that overheats in your hands under sustained
fire. Nobody wrote a `DURABILITY → OVERHEAT_RISK` mapping. The contract reasoned that these are the
same idea expressed in two different worlds' vocabularies, and validators agreed.

That is the entire thesis of the project, running in a game loop at 60fps.

> `web/src/components/games/NovaDrift.tsx` — heat accumulation and weapon lockout

### Step 5 — Evolve: the item grows through use, but cannot be farmed

Clear a Nova Drift run and the same pattern repeats — the game writes what happened:

> "Player destroyed 24 hostiles in a single Nova Drift run using the Ash-Vow Lance, a weapon
> translated in from Emberfall. The weapon overheated 3 times under sustained fire, and the run
> ended with 41 of 100 hull remaining."

```
POST /api/evolve  { itemId, usageEvent }
   → ItemRegistry.evolve_item(item_id, usage_event)
```

The obvious exploit here is grinding trivial events to inflate an item until it breaks every game it
touches. Driftt closes that in three places at once:

1. **A shrinking ceiling.** Headroom is `max(0, 6 − times_this_item_has_evolved)`, computed on-chain
   from stored state. The more an item has already grown, the less it can grow again.
2. **The Equivalence Principle**, which validators judge against: *"an output that awards a large
   power gain for a trivial or repetitive event is NOT equivalent to one that correctly awards
   little or nothing."* The prompt itself instructs that most events deserve 0, 1 or 2.
3. **A deterministic clamp after consensus**, plus a rarity guard: rarity may never fall, and may
   never outrun the item's actual power band.

The growth is written in place, a new chapter is appended to the item's lore, and an `evolved` entry
joins its provenance. One item now carries a record spanning two unrelated games.

### What happens when the chain doesn't cooperate

Worth stating explicitly, because it is a design decision rather than an omission. Each intelligent
call runs an LLM on **every** validator and waits for agreement, so it takes tens of seconds to a
couple of minutes. The server polls for a *decided* status and distinguishes two failure classes
that need opposite responses:

- **The contract threw** (`FINISHED_WITH_ERROR`) — fatal, never retried, because it will throw again.
  Note the subtlety: a transaction can reach `ACCEPTED` with `AGREE` when validators unanimously
  agree *that the contract failed*. Consensus succeeding is not the contract succeeding.
- **The round could not agree or form a validator set** (`UNDETERMINED` / timeouts) — nothing was
  committed, so resubmitting draws a fresh validator set and usually converges. That is normal for a
  non-deterministic method.

Past a 240-second budget the write is abandoned and **the player sees an error they can retry**.
There is deliberately no simulation fallback: the app is on-chain, or it is honest about failing.

### The contracts

Two active Intelligent Contracts, written in Python, deployed on GenLayer.

```
   ┌────────────────────────────────────────────────────────────────┐
   │  ItemRegistry                        [ ledger + forge + evolve ]│
   │  · forge_item()   [INTELLIGENT]  gameplay event → new item      │
   │  · evolve_item()  [INTELLIGENT]  usage event → bounded growth   │
   │  · items · rulesets · provenance · ownership                    │
   └───────────────────────────────▲────────────────────────────────┘
                reads item + ruleset │
                     ┌───────────────┴───────────────┐
                     │  TranslationEngine            │
                     │  request_translation()  [INTELLIGENT]
                     │  item → the target game's ruleset
                     └───────────────────────────────┘
              every intelligent call is settled by Optimistic Democracy
```

| Contract | Role |
|---|---|
| `contracts/item_registry.py` | **Ledger + forge + evolve.** `forge_item` designs a balanced item from a gameplay event. `evolve_item` grows an item through use, under a ceiling that shrinks each time it evolves so items cannot be farmed into god-tier. Both are intelligent (LLM + consensus) and write to the registry's own storage, so results land at consensus. Also holds rulesets, append-only provenance, and ownership. |
| `contracts/translation_engine.py` | **The killer feature.** `request_translation` rebalances an item into another game's ruleset, enforcing the balance invariant by consensus *and* a deterministic clamp. |

The forge lives inside the registry deliberately. The original design had a separate `ItemForge`
that emitted a cross-contract `mint_item` — but an emitted message only dispatches at *finalization*,
which is not reliably triggerable on these networks, so the forged item never landed. A write to a
contract's **own** storage persists the moment the transaction is accepted. Merging forge and store
into one transaction is what makes an on-chain forge actually complete.

### The application

A Next.js app with two hand-written HTML-canvas games (no game engine dependency):

- **Emberfall** — top-down fantasy dungeon crawler. `WASD` to move, `Space` to swing.
- **Nova Drift** — twin-stick sci-fi shooter. `WASD` to fly, mouse to aim, hold to fire.

Gameplay is always instant and local. The three **deliberate moments** — forging on a kill,
translating into another game, evolving through use — are settled on-chain by the `/api/forge`,
`/api/translate`, and `/api/evolve` routes, which submit real transactions server-side. The browser
needs no wallet: the server relays and pays gas, and the player's address is passed through
explicitly so the item is still owned by the player. Each call runs the LLM on every validator and
waits for agreement, so it takes tens of seconds to a couple of minutes and shows a *"forging on
GenLayer"* state. On success the UI displays **"Settled on GenLayer ✓"** with the transaction id,
and the inventory reads items straight from the on-chain registry.

**There is deliberately no simulation fallback.** If an on-chain call fails, the player sees an
error and can retry — never a locally-computed result quietly presented as on-chain. The app is
on-chain, or it is honest about failing.

A separate, clearly-labeled **local mode** runs when no contracts are configured at all: the same
leader / validator / equivalence-principle machinery runs in-browser (`web/src/lib/oracle.ts`) so
the project is explorable without a deployment.

### Tech stack

| Layer | Choice |
|---|---|
| Intelligent Contracts | Python on GenLayer (`gl.nondet.exec_prompt`, `gl.eq_principle.prompt_comparative`, `TreeMap` / `DynArray` / `u256` storage, cross-contract `get_contract_at`) |
| Chain SDK | `genlayer-js` (viem-based) |
| Frontend | Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 |
| LLM | Anthropic Claude via the official SDK — on-chain (validators) and in local mode |
| Games | Hand-written HTML canvas, no engine dependency |

---

## 5. What is deployed and verified

The live application runs on **hosted GenLayer Studio** (`https://studio.genlayer.com/api`), where
the same Intelligent Contracts and Optimistic Democracy consensus execute in seconds to a couple of
minutes rather than the public testnet's slower, gas-metered rounds. That is what makes the games
playable on-chain.

| Contract | Studio address |
|---|---|
| `ItemRegistry` (forge + evolve + ledger) | `0xD80f0437ea315638505F93497CC3fFBa77cCCFE4` |
| `TranslationEngine` | `0x08E0B9329D7e4Af002924930Cd7F8968A23851d9` |
| `ItemForge` (superseded, kept for reference) | `0xe00232295c6Ed6f454f9B3A9008069d00d19B9Ba` |
| `EvolutionTracker` (superseded, kept for reference) | `0xc7c9B5ad514c9911F1c60b39f3D2dec5E27c5B1A` |

> GenLayer Studio is a shared sandbox that resets periodically; when it does, the app is redeployed
> and these addresses change. The current live set is always recorded in
> `contracts/deployments.json`.

The full loop is verified against the live contracts through the app:

- **Forge** — a gameplay event → the LLM designs a balanced item, validators agree under the
  Equivalence Principle, and the item is stored, in a single transaction. Verified example:
  *"Ash-Vow Cleaver"*, tier 72 epic, unanimous validator approval, read back from the registry.
- **Translate** — a fire greatsword becomes a plasma lance, power held within ±5 of the original,
  and `DURABILITY` correctly rewritten as `OVERHEAT_RISK`.
- **Evolve** — bounded growth verified against the anti-farming ceiling: a grindy event earns zero,
  a genuine feat earns a small, capped gain.

The contracts were **also deployed to and proven on the public Bradbury testnet** (chain id `4221`,
`https://rpc-bradbury.genlayer.com`), where a real forge reached **6-of-6 validator consensus** and
the item was stored on-chain (`item_count` 0 → 1, read back by id and by owner). Addresses are in
`contracts/deployments.testnet.json`. The public testnet is durable but slower, so it stands as the
"deployed on a public network" proof while Studio hosts the fast, playable app.

---

## 6. Engineering notes

Building against a live GenLayer network surfaced three failure modes worth recording, because each
one fails *silently*:

1. **`genlayer-py` could not read the target chain.** Both SDKs read receipts via
   `getTransactionData` on the consensus contract, and the ABI shipped by `genlayer-py` 0.18.0 no
   longer matched the deployed contract — its decoder threw on transactions the chain had already
   accepted. `genlayer-js` decodes correctly, so the deployer is Node, not Python.

2. **Address arguments must be wrapped in `CalldataAddress`.** A bare `"0x…"` string is encoded into
   calldata as a *string*; a method that declares `Address` then receives a `str` and dies inside the
   GenVM. This silently produced "deployed" contracts with no code behind them until the encoding was
   fixed.

3. **Consensus succeeding is not the contract succeeding.** A transaction reaches `ACCEPTED` with
   `AGREE` when validators unanimously agree — *including when they agree that the contract threw*.
   That only shows up in `txExecutionResult` as `FINISHED_WITH_ERROR`. Every write in this repo
   asserts on the execution result, not just the consensus status.

A fourth lesson shaped the architecture: emitting a cross-contract message only dispatches at
finalization, which is not reliably triggerable on these networks — hence merging the forge and the
evolution into the registry itself. Contracts also **normalize** LLM output (deriving rarity from the
power band, clamping power, reading every field defensively) rather than asserting on it, so a single
unlucky sample never discards a consensus-approved result.

---

## 7. Status and roadmap

**Working today:** contracts deployed on GenLayer (Studio + public Bradbury testnet); the full
forge → translate → evolve loop running on-chain through the app, strictly, with no simulation
fallback; two playable games in different genres; on-chain inventory and provenance; a responsive
UI built on GenLayer's official "Autonomous Core" brand palette.

**Verified clean:** `npm run build`, `tsc --noEmit`, and `eslint` all pass.

**Roadmap:**
- A guided objective, to give the loop an explicit goal for first-time players.
- A **third game in a different genre** (e.g. racing) to prove the translation engine generalizes
  beyond fantasy ↔ sci-fi.
- A peer-to-peer marketplace for cross-game items.
- A player reputation score that travels with provenance.

---

## Why this could not be built before GenLayer

Driftt's core operation is an LLM making a subjective judgement about value — and that judgement
being trusted by parties who do not trust each other. On a deterministic chain, the reasoning is
impossible. Off-chain, the trust is impossible.

GenLayer's Optimistic Democracy and Equivalence Principle collapse those two requirements into one
transaction: non-deterministic reasoning, settled by decentralized agreement, with the result
written on-chain. Driftt is what that makes possible — items that carry their meaning, not their
numbers, and can therefore go anywhere.

---

**Repository:** [github.com/Dotman-Bei/driftt](https://github.com/Dotman-Bei/driftt)
**Run it locally:** `cd web && npm install && npm run dev` → http://localhost:3000
