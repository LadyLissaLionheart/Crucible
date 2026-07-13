# Design Decisions

## Core Philosophy

**Simple core mechanics** — easy to learn, fast at the table. The player's ritual is always identical: roll 4d12, count successes, spend edges if desired, check parity. No lookups, no conditional math. All risk is handled by the GM through a single number.

**Allow cinematic moments** — mechanics create drama, not just pass/fail. The parity-based critical system ensures that even impossible rolls have a chance of breakthrough, and sure things can unravel. The Success Ladder (Misfortune, Setback, Triumph) provides narrative texture beyond binary outcomes.

**Scale to the complexity of the group** — simple for casual play, deep for invested groups. The Core book stands alone as a complete game for rules-lite groups. The Advanced book adds tactical depth, expanded subsystems, and crunchy options for groups that want them. The system itself scales naturally: the core resolution mechanic is immediately accessible, while edges, expertise dice, and the Inspiration/Tension economy provide layers of strategic depth for those who seek it.

## Book Structure

| Book | Focus | Audience |
|------|-------|----------|
| **Core** | All core systems, character creation, basic resolution, GM tools | Rules-lite groups; entry point for everyone |
| **Advanced** (companion/bundle) | Expanded subsystems, tactical options, character depth, niche mechanics | Crunch-oriented groups |

The Core must stand alone as a complete game. The Advanced book is additive, not mandatory.

## Core Mechanic: d12 Success-Counting

**Resolution**: Roll 4d12. Count successes against your Target Number (TN). The GM applies Risk as a penalty zone.

**The three-zone die** (per die):
| Condition | Result |
|---|---|
| Die ≤ Risk | −1 success |
| Risk < die < TN | 0 |
| Die ≥ TN | +1 success |

**Risk overrides success** — if a die is both ≥ TN and ≤ Risk, penalty wins.

**Success Ladder**:

| Net | Tier | Meaning |
|---|---|---|
| −1 or less | **Misfortune** | Failure, things get complicated |
| 0 | **Setback** | Failure |
| 1+ | **Triumph** | Clean success and beyond |

**Resolution flow**:
1. Player says what they want to do and what attribute they're using.
2. GM decides if it's automatic (no roll), impossible (no roll), or Risk N.
3. Player rolls 4d12, counts successes ≥ TN, subtracts dice ≤ Risk.
4. **Spend edges** (optional): each edge shifts one die up by 2 (max 12). A die can only be shifted once per roll. Recalculate successes/penalties after shifts.
5. Check die parity:
   - **4 evens**: **Critical Success** — ignore penalties, +1 success. Player gains +2 Inspiration.
   - **3 evens**: **Critical Success** — player gains +1 Inspiration.
   - **2 evens, 2 odds**: **Clash** — no resource gain.
    - **3 odds**: **Critical Failure** — GM gains +1 Tension.
    - **4 odds**: **Critical Failure** — ignore successes, −1 success. GM gains +2 Tension.
6. GM narrates the result using the Success Ladder.

**Turn trivially possible → don't roll. Turn trivially impossible → don't roll.** Risk is only for the grey zone where a roll matters.

## Resources

Every roll generates resources based on die parity. Each d12 has 6 even faces (2,4,6,8,10,12) and 6 odd faces (1,3,5,7,9,11), giving fixed binomial odds regardless of TN or Risk:

| Name | Dice | Gain | Probability |
|---|---|---|---|---|
| Critical Success | 4e | +2 Inspiration | 1/16 = 6.25% |
| — | 3e / 1o | +1 Inspiration | 4/16 = 25% |
| Clash | 2e / 2o | — | 6/16 = 37.5% |
| — | 1e / 3o | +1 Tension | 4/16 = 25% |
| Critical Failure | 4o | +2 Tension | 1/16 = 6.25% |

On a **Critical Success** (4 evens), ignore the penalty zone and gain +1 success — only successes and neutral dice count, plus a bonus success. On a **Critical Failure** (4 odds), ignore the success zone and suffer −1 success — only penalties and neutral dice count, plus an extra penalty. This means a desperate roll can break through risk, and a sure thing can unravel despite high skill.

## Edges

Edges represent training, talent, circumstance, or equipment that lets a character exert mastery over a check. They can come from specializations, gear, situational bonuses, or other sources.

**Spending an edge**: after rolling but before checking parity, spend one edge to shift one die's face value up by 2 (to a maximum of 12). Recalculate successes and penalties based on the new value. A given die can only be shifted once per roll. Multiple edges can be spent on different dice in the same roll.

Edges preserve parity (even+2 stays even, odd+2 stays odd), so the resource economy is unaffected by edge use. Edges also never cause a reroll, keeping the 4d12 resolution consistent.

**Per-session budget**: each edge source defines how many uses the player gets per session. Specializations typically grant 1–3 uses; other sources may vary.

## Risk

Risk is 0–12. The GM picks a number based on the situation. No table lookup — just instinct: "this is risk 7" or "this is standard (risk 0)."

**What different Risk values mean** (at TN 8, the human average):
| Risk | Penalty zone | Expected net successes | Feel |
|---|---|---|---|
| 0 | None | 1.67 | Routine |
| 2 | 1–2 | 1.33 | Slightly risky |
| 4 | 1–4 | 1.0 | Risky |
| 6 | 1–6 | 0.67 | High risk |
| 8 | 1–8 | 0.33 | Desperate |
| 10 | 1–10 | 0.13 | Near-impossible |
| 12 | 1–12 | 0 | Impossible (max net = 0) |

At Risk 12 every die is a penalty — the normal calculation can never exceed Setback. A Critical Success (4 evens) ignores penalties, making success possible against impossible odds. The GM may let the roll happen for dramatic effect, knowing a breakout is always possible.

**Risk caps at TN−1 internally.** Risk can never equal or exceed TN — a die that beats the TN is always a success, never a penalty. This avoids contradictory outcomes where the same die scores and loses a success. The input field is freely editable; the cap is enforced in resolution and odds calculations only.

## Expertise Dice

Players always roll 4d12, but the composition changes with tier. Expertise dice are mechanically identical to standard dice (same three-zone system, TN, Risk) but determine **Effect Magnitude** and can trigger special abilities.

**Tier by Level:**

| Tier | Level | Expertise Dice | Standard Dice |
|------|-------|----------------|---------------|
| Heroic | 1-5 | 1d12 | 3d12 |
| Paragon | 6-10 | 2d12 | 2d12 |
| Epic | 11-15 | 3d12 | 1d12 |
| Legendary | 16-20 | 4d12 | 0d12 |

**Effect Magnitude** = sum of expertise dice. Only calculated when the check requires it (damage, progress, etc.). Not every check needs magnitude.

**Success Ladder and Magnitude:**
- Misfortune: No Effect Magnitude
- Setback: Magnitude at a cost (negotiated with GM)
- Triumph: Magnitude

**Successes/Penalties** (per-action augmentation, not persistent resource):
- For each net success (Triumph), gain a successes point
- For each net penalty (Misfortune), gain a penalty
- Successes can be spent to augment the action: +5 Effect Magnitude per successes spent
- Other successes/penalty effects TBD (crunchy book defines specific mechanics)

**Key Design Notes:**
- NPCs never roll — expertise dice are player-exclusive
- Visual distinction via dice color teaches the system naturally
- Effect Magnitude scales linearly with tier: ~6.5 (Heroic) to ~26 (Legendary)

## Rationale for d12

The d12 is the most underused die in the hobby. It gives 12 discrete outcomes and a clean 8.3% step per pip, which is finer granularity than a d10 (10%) or d20 (5%). Four dice keeps the probability curve tightly clustered while leaving room for modifiers to matter.

## Attributes

Seven attributes, each with two TN values:

| Attribute | Domain | Magic | Active Examples | Reactive Examples | Tolerance |
|-----------|--------|-------|-----------------|-------------------|-----------|
| Might | Physical power, brute force, endurance | Echoes Unbroken | Smash a door, wrestle a guard, cast sorcery spells | Brace against a collapsing ceiling, resist being shoved, power through exhaustion | Health & Endurance |
| Finesse | Precision, speed, dexterity | Monastic Tradition | Pick a lock, shoot an arrow through a slit, slip past a sentry | Dodge a trap, catch a falling object, keep your footing on ice | Mobility & Coordination |
| Instinct | Survival, raw reflexes | Wild Covenant | Hunt, track, cast druid magic, sense a lie | Flinch from a hidden blade, wake at a strange sound, parry a surprise attack | Engagement & Connection |
| Cunning | Deception, strategy | Esoteric Pact | Feint in combat, forge a document, cast esoteric spells | Detect a con, see through a disguise, escape a snare | Ambition & Skepticism |
| Reason | Logic, analysis | Axiom Doctrine | Solve a puzzle, recall a weakness, cast axiom spells | Spot a logical inconsistency, resist a false argument, recall a fact under pressure | Focus & Patience |
| Presence | Charisma, force of will, leadership | Psychic Magic | Intimidate a thug, inspire allies, negotiate a deal | Resist intimidation, hold your ground against a terrifying creature, keep composure during a negotiation | Ego & Composure |
| Conviction | Leadership, resolve | Divine Edict | Cast divine spells, uphold a vow, inspire through belief | Endure a mental assault, stay true under torture, reject a supernatural influence | Willpower & Integrity |

**Attribute scale**: 1–14. Human average is 4.

**Target Numbers**: Each attribute has two TNs — **Active** (when the player declares an action) and **Reactive** (when the GM calls for a roll in response to a situation).

**TN calculation**: Both TNs start at 12. Each point in the attribute lets the player reduce *one* of the two TNs by 1. This means players must choose between being proactive (lower Active TN) or resilient (lower Reactive TN), or balance the two.

**TN floor**: TNs can go as low as 2. At TN 2, dice succeed on 2–12 (91.7% per die) but Risk can still create tension.

**Probability benchmarks** (single die ≥ TN):
| TN | P(success per die) | P(≥1 on 4d12) | P(≥2 on 4d12) |
|----|----|----|----|
| 12 | 8.3% | 29.4% | 4.4% |
| 10 | 25% | 68.4% | 26.2% |
| 8 | 41.7% | 88.3% | 58.4% |
| 6 | 58.3% | 97.0% | 83.6% |
| 4 | 75% | 99.6% | 96.1% |
| 2 | 91.7% | ~100% | 99.9% |

**Net expected successes** across different TN/Risk combinations:
| TN ↓ Risk → | 0 | 3 | 6 | 9 |
|---|---|---|---|---|
| 12 | 0.33 | 0.0 | — | — |
| 10 | 1.0 | 0.67 | 0.33 | — |
| 8 | 1.67 | 1.33 | 0.67 | 0.33 |
| 6 | 2.33 | 1.67 | 1.33 | 0.67 |
| 4 | 3.0 | 2.33 | 2.0 | 1.0 |
| 2 | 3.67 | 3.0 | 2.33 | 1.67 |

## Open Decisions

### Character Creation
- Point-buy or array for attribute distribution?
- Starting attribute points? (28 = all at human average; 35–40 for competent heroes?)
- Skills layered on top, or pure attribute-based?
- Derived stats (health, speed, etc.)?
- Is the starting TN always 12, or do you start with some distribution already applied?

### Progression
- How do attributes increase? XP-based, milestone, or something else?
- Are there diminishing returns?
- What else advances aside from attributes?

### GM Tools (Core)
- Guidance for assigning Risk (what's Risk 3 vs Risk 8?)
- Should the core book include a quick-reference Risk table by genre/situation?

### The Advanced Book
- Which subsystems get moved from core to advanced?
- What new systems does the advanced book add? Combat maneuvers? Crafting? Social influence? Domain play?
- Does the advanced book introduce any resolution modifiers beyond Risk? (E.g., boon/bane dice, successes floors.)

### Edges
- What is the standard per-session budget for specialization edges? (3? 5? scales with level?)
- Can edges be refreshed mid-session (Inspiration spend, rest, milestone)?
- Do GMs get a pool of edges for NPCs/enemies?
- How do multiple edge sources on the same roll interact? (Can you spend a specialization edge AND a gear edge on the same roll?)

### Meta
- Genre/setting? The attributes are setting-agnostic by design — universal toolkit, or a specific world?
- What happens to the 4d12 pool size? Always fixed, or can it change?
