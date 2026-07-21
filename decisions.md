# Design Decisions

## Core Philosophy

**Simple core mechanics** — easy to learn, fast at the table. The player's ritual is always identical: roll 4d12, count successes against your Target Number (TN), need at least one. No parity, no conditional math, no lookups. All risk and reward is handled by a small set of named resources.

**Allow cinematic moments** — mechanics create drama, not just pass/fail. The shared Tenacity deck means every player watches every roll and can spend to help an ally; Setbacks feed both the player (Tenacity) and the GM (Threat), so even failure generates resources and onward pressure. The Success Ladder (Failure, Success, improved outcome) provides narrative texture beyond binary outcomes.

**Scale to the complexity of the group** — simple for casual play, deep for invested groups. The Core book stands alone as a complete game for rules-lite groups. The Advanced book adds tactical depth, expanded subsystems, and crunchy options (suit-based Tenacity effects, etc.) for groups that want them. The system itself scales naturally: the core resolution is immediately accessible, while Prowess, Burden, Tenacity, Threat, and Risk provide layers of strategic depth for those who seek it.

**Shared economy, individual hands** — Tenacity is a single deck the whole party draws from, but each player holds their own hand. This keeps the table engaged on every roll: anyone can spend to rescue anyone.

## Book Structure

| Book | Focus | Audience |
|------|-------|----------|
| **Core** | All core systems, character creation, basic resolution, GM tools | Rules-lite groups; entry point for everyone |
| **Advanced** (companion/bundle) | Expanded subsystems, tactical options, character depth, niche mechanics | Crunch-oriented groups |

The Core must stand alone as a complete game. The Advanced book is additive, not mandatory.

## Core Mechanic: d12 Success-Counting

**Resolution**: Roll **4d12**. Count successes against your Target Number (TN). You need **at least one success** to succeed.

**Per-die outcome** (a die is exactly one of three states):
| Condition | Result |
|---|---|
| Die ≤ (1 + Risk) | **Setback** — locked, pays Tenacity + Threat, never a success |
| (1 + Risk) < die < TN | Neutral miss — no success, not a Setback, may be rescued by Tenacity |
| Die ≥ TN | **Success** (+1 success) |

**Risk overrides nothing** — a die that is both ≥ TN and ≤ (1+Risk) cannot exist, because TN is always greater than (1+Risk). See Risk below.

**Success Ladder**:
| Net successes | Meaning |
|---|---|
| 0 | **Failure** — the attempt does not succeed |
| 1+ | **Success** — the attempt succeeds |
| 2+ | Success with an **improved outcome** (effect, magnitude, or narrative texture) |
| 3 | Exceptional success |

Surplus successes (beyond the first) improve the outcome. The specific scale of "improved outcome" is adjudicated by the GM and/or defined by future crunch; it is intentionally light at the Core level (the Expertise-dice magnitude system was removed).

**Resolution flow**:
1. Player says what they want to do and what attribute they're using.
2. GM decides TN (from the attribute) and the Risk (situation).
3. Player rolls **4d12** (base) together with any **Edge** dice already declared before the roll (each granter rolls their own +1 d12, in a different color). Any **Burden** (Risk +1) declared before the roll is applied.
4. Apply **Risk**: dice ≤ (1 + Risk) are **Setbacks** — locked, and each pays the rolling player +1 Tenacity and the GM +1 Threat. They never count as successes and cannot be rescued.
5. Count successes: base dice ≥ TN (that are not Setbacks) plus Edge dice ≥ TN.
6. Players may spend **Tenacity** to rescue a neutral-miss die (see Tenacity). Each player may spend at most one card per roll. Net successes ≥ 1 = Success. GM narrates using the Success Ladder.

**Turn trivially possible → don't roll. Turn trivially impossible → don't roll.** Risk is only for the grey zone where a roll matters.

## Risk & Setback

**Risk** is a dial from **1 to 3**. It is the campaign's **uncertainty/consequence** knob, not a difficulty knob — it does not lower your chance of success (a Setback die is always below TN and would have missed anyway). Risk sets how many of your dice become **Setbacks**.

**Setback threshold** = **1 + Risk**. A die showing that number or lower is a Setback.
| Risk | Setback faces | Setback chance / die |
|---|---|---|
| 1 | 1–2 | 16.7% |
| 2 | 1–3 | 25.0% |
| 3 | 1–4 | 33.3% |

A natural **1 is always a Setback** (since Risk ≥ 1, 1 ≤ 1+Risk always).

**Setback effects**:
- The rolling player gains **+1 Tenacity**.
- The GM gains **+1 Threat**.
- The die is **locked**: it cannot be altered by Edge, and it cannot be rescued by Tenacity.

Risk is set by the **situation** (the GM, for dangerous/uncertain actions) and may be raised by the player through **Burden** (opt-in). Because Risk never changes the success count, raising it is a *bet*: more Setbacks mean more Tenacity for the table and more Threat for the GM, but no change to whether you succeed.

## Exceptional, Disadvantage & Advantage (Deferred)

> **Deferred to Advanced.** Exceptional/Inferior aspect tags and their associated Advantage/Disadvantage mechanics are removed from Core. They may return in the Advanced book as a subsystem for representing notable foe strengths and weaknesses. At Core level, adversary strength is expressed through **Risk**, **Threat spends**, and **narrative**.

## Edge (from Prowess)

**Edge** is a bonus die granted by spending **Prowess** (or by an ally who spends Prowess on your behalf).

**Declared before the roll.** Edge is committed *before* any dice are rolled — the player who will roll and any ally who assists with Edge must decide and narrate their involvement up front, before the results are known. This keeps Edge a **proactive** resource (you stake your Prowess and set up the fiction in advance) and cleanly separates it from **Tenacity**, which is spent *after* the roll as a reactive rescue. Forcing the narrative before the outcome is known is intentional: it makes assists feel earned rather than retrofitted to a result.

**Spending an Edge**: the active player rolls **+1 d12** in a **different color** alongside their base dice — the Edge die is part of the active player's pool but is visually distinct.
- A die on the Edge die that is **≥ TN** counts as a success (like any other).
- A **1** on the Edge die is a **Setback for the granter** (granter gains +1 Tenacity, GM +1 Threat).
- Edge dice are **Risk-free**: Risk does not apply to them (only a 1 pays), so assisting never exposes the granter to the roller's Risk.

**Limits**: each player may grant/hold at most **one Edge per roll** (so a roll can grow to 4 base + N Edge dice, one per participating player). Edge stacks across players but is capped by the number of players. Whether an Edge is self-applied by the roller or granted to an ally, the decision is made before the check.

## Critical Success

**Trigger**: two or more dice showing **12** across the active player's **base dice only** (Edge dice do not count toward critical). A 12 is always a success (TN ≤ 12), so a critical represents multiple dice achieving the maximum face — a rare, exciting outcome.

**Effect**:
- The active player takes a **bonus turn** after the current turn resolves.

**Edge interaction**: Edge dice are a different color and do **not** count toward the critical trigger. They add raw success potential but never contribute to a crit.

**Crit rate** (2+ 12s on 4 base dice, p = 1/12 per die):
| Pool | Crit % |
|---|---|
| 4 base dice | 3.72% |

## Tenacity (Player Resource)

Tenacity is the players' spendable resource, drawn from a **single shared deck** the whole party uses.

**The deck**: standard player cards, **2–10 × 4 suits = 36 cards**. One shared draw pile; played and excess cards go to a discard pile; when the draw pile is empty, the discard is reshuffled into the draw pile. **Suit is irrelevant at Core level** (reserved as an Advanced/knack mechanic).

**Hands**: players draw from the shared pile into **individual hands**. A player's hand cap = **gameplay tier + 2** (3 at Heroic). A player at cap who would gain a card forfeits it (the card stays in the deck/discard; the draw is not depleted).

**Gain**: each **Setback** a player rolls pays them **+1 Tenacity** (base-die Setbacks pay the roller; Edge-die Setbacks pay the granter).

**Spend — card-match rescue**: a player may play **one Tenacity card** to turn a die into an **automatic success** if the **card's rank matches the die face**. Rules:
- Only a die in the range **(1 + Risk) < die < TN** can be rescued — i.e. a neutral miss that is not a Setback and not already a success.
- **Suit is ignored**; rank alone must match.
- **Any player** may spend for **any other player's roll** (including the roller), as long as they can justify it in the fiction.
- Max **one card per player per roll**.
- The played card goes to the **discard** pile.

This is the heart of the shared deck: every player tracks every roll, listening for a moment their card can turn a near-miss into a success.

## Threat (GM Resource)

**Threat** is the GM's resource pool. It is generated **live, by every Setback** (each Setback gives the GM +1 Threat). There is no automatic per-interval gain and no separate Risk→Threat conversion step — the Setback event is the source.

The GM spends Threat on adversarial leverage (the specific spend vocabulary is deferred to the GM Tools section / Advanced book). Because Threat flows from the table's own Risk and Setbacks, a dangerous session naturally arms the GM.

## Prowess & Burden (Player Systems)

These are the character's limited-use, player-controlled systems (formerly "Specializations"). Each is a bucket of activated abilities with a **per-session use budget**; the character spends a use to grant the corresponding generic effect.

| System | Spend effect | Notes |
|--------|-------------|-------|
| **Prowess** | Grant **Edge** (+1 bonus d12, granter rolls) | The character's drive/skill; spend to help self or ally |
| **Burden** | Raise **Risk by 1** (table-wide to base dice, max 3) | The character's flaw/weight; spend to raise the stakes |

- Each player may spend **at most one Prowess and one Burden per roll**.
- Because Burden raises Risk, it feeds more Setbacks (more Tenacity for the table, more Threat for the GM) — spending a Burden is "my flaw creates opportunity."
- Individual Prowess/Burden abilities list their own frequency (e.g. "Keen Eye: 1/session").

## Attributes

Seven attributes, each with two TNs:

| Attribute | Domain | Magic | Active Examples | Reactive Examples | Tolerance |
|-----------|--------|-------|-----------------|-------------------|-----------|
| Might | Physical power, brute force, endurance | Echoes Unbroken | Smash a door, wrestle a guard, cast sorcery spells | Brace against a collapsing ceiling, resist being shoved, power through exhaustion | Health & Endurance |
| Finesse | Precision, speed, dexterity | Monastic Tradition | Pick a lock, shoot an arrow through a slit, slip past a sentry | Dodge a trap, catch a falling object, keep your footing on ice | Mobility & Coordination |
| Instinct | Survival, raw reflexes | Wild Covenant | Hunt, track, cast druid magic, sense a lie | Flinch from a hidden blade, wake at a strange sound, parry a surprise attack | Engagement & Connection |
| Cunning | Deception, strategy | Esoteric Pact | Feint in combat, forge a document, cast esoteric spells | Detect a con, see through a disguise, escape a snare | Ambition & Skepticism |
| Reason | Logic, analysis | Axiom Doctrine | Solve a puzzle, recall a weakness, cast axiom spells | Spot a logical inconsistency, resist a false argument, recall a fact under pressure | Focus & Patience |
| Presence | Charisma, force of will, leadership | Psychic Magic | Intimidate a thug, inspire allies, negotiate a deal | Resist intimidation, hold your ground against a terrifying creature, keep composure during a negotiation | Ego & Composure |
| Conviction | Leadership, resolve | Divine Edict | Cast divine spells, uphold a vow, inspire through belief | Endure a mental assault, stay true under torture, reject a supernatural influence | Willpower & Integrity |

**Target Numbers**: Both TNs start at **12**. Each point in the attribute lets the player reduce *one* of the two TNs by 1. This means players must choose between being proactive (lower Active TN) or resilient (lower Reactive TN), or balance the two.

**Human average**: an average person has attribute **2**, spending both points split → **TN 11 / 11** in both. Player characters are built above this baseline.

**TN floor**: a TN **cannot go below 5**. (Risk maxes at 3, so its Setback threshold reaches 4; TN ≥ 5 keeps the success zone strictly above the Setback zone, with no overlap.)

**Probability benchmarks** (single die ≥ TN, and 4d12 ≥ 1 success):
| TN | P(success/die) | P(≥1 on 4d12) |
|----|---------------|----------------|
| 12 | 8.3% | 29.4% |
| 11 | 16.7% | 51.8% |
| 10 | 25.0% | 68.4% |
| 9 | 33.3% | 80.2% |
| 8 | 41.7% | 88.4% |
| 7 | 50.0% | 93.8% |
| 6 | 58.3% | 97.0% |
| 5 | 66.7% | 98.8% |

At the human-average TN 11, a plain 4d12 roll succeeds about 52% of the time; help (Edge, Tenacity rescue) and lower TNs raise that further. With 4 base dice, surplus successes (2+) are more common than the old 3-die pool, so the question of how frequently "improved outcome" triggers on a plain roll is an **open design decision** (see Open Decisions).

## Tiers

Tiers track character level. They govern the Tenacity **hand cap** (tier + 2). The game has a finite 15-level arc: characters begin at Heroic and end at Mythic.

| Tier | Levels | Hand cap (tier + 2) |
|------|--------|---------------------|
| Heroic | 1–3 | 3 |
| Paragon | 4–6 | 4 |
| Ascendant | 7–9 | 5 |
| Legendary | 10–12 | 6 |
| Mythic | 13–15 | 7 |

## Rationale for d12

The d12 gives 12 discrete outcomes and a clean 8.3% step per pip, finer granularity than a d10 (10%) or d20 (5%). Four dice creates a strong central tendency while leaving room for modifiers to matter, and the small pool keeps the ritual fast. The odd-vs-even parity system was removed; the d12 is now read purely as a face-value die (success vs Setback vs neutral by TN and Risk).

## Removed Mechanics

The following were part of earlier drafts and are **removed** in this design:
- **Even/odd parity** — no longer used for anything (Inspiration/Tension no longer derive from parity).
- **Old "Edge" (spend to shift a die +2)** — replaced by Prowess → Edge (bonus die).
- **Expertise dice / Effect Magnitude** — removed; surplus successes improve the outcome without a separate dice pool.
- **Risk as a penalty zone** — Risk no longer subtracts from successes; it is the Setback/uncertainty dial.
- **Difficulty values** — was replaced by Exceptional/Inferior aspect tags with Disadvantage/Advantage die rolls; those are now deferred to Advanced.

## Open Decisions / Deferred

### Character Creation
- Attribute score range and maximum (human average is 2; PC baseline above that).
- Starting attribute points / how attributes are distributed.
- Skills layered on top, or pure attribute-based?
- Derived stats (health, speed, etc.)?

### Progression
- How attributes increase; XP-based, milestone, or other?
- Confirmed vectors: attributes, new abilities, equipment, Prowess/Burden size. Base pool stays fixed at 4d12 (only Edge adds dice).
- Success Ladder thresholds: with 4d12, "improved outcome" (2+) fires ~41% on a plain roll at TN9. Decide whether to bump thresholds (e.g., improved at 3+, exceptional at 4) or accept common improved outcomes as a feature of competent characters.

### GM Tools (Core)
- Guidance for assigning Risk (what's Risk 1 vs Risk 3?).
- The specific **Threat spend vocabulary** (what the GM buys with Threat).
- How to express adversary strength through Risk and Threat (replaces Exceptional/Inferior at Core level).

### Prowess & Burden
- Standard per-session budget per ability?
- Are uses refreshed mid-session (Tenacity spend, rest, milestone)?
- Can multiple sources apply to the same roll?

### Tenacity
- Hand-overflow rule confirmed (card forfeited at cap).
- Suit-based effects (Advanced).

### Exceptional / Disadvantage / Advantage (Deferred to Advanced)
- How to implement foe-strength tags mechanically (reroll, modifier, or different system?).
- How many Exceptional/Inferior aspects can an adversary have?
- Cap on Exceptional/Inferior modifiers?
- Environmental Disadvantage — same system or different?

### The Advanced Book
- Suit-based Tenacity effects.
- Expanded Prowess/Burden abilities, social/domain combat, crafting.
- Formal outcome-magnitude scale for surplus successes.
