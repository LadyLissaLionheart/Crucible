name: odds
description: When the user asks about probabilities, success rates, odds, or chances in the Secondary Design system, you must run the calculator to produce exact numbers. Do not estimate, guess, or compute in your head.

# Odds Calculator Skill

When the user asks probability-related questions (e.g., "what are the odds of X", "how likely is Y", "chance of Z"), you **must** use the calculator tool to produce ground-truth answers.

## Calculator

**Location**: `prototypes/calc.html`

Open it with `open prototypes/calc.html` and report the numbers from the interactive tool.

Alternatively, use the Python script:

**Location**: `scripts/calc.py`

Usage:
```
python3 scripts/calc.py <TN> <Difficulty>
```

Outputs the full net success distribution and tier probabilities.

## What to report

Report the tier probabilities (Misfortune, Setback, Meager, Decisive) and, if relevant, specific net success probabilities. Always show the TN and Difficulty you used so the user can verify.

## What not to do

- Do not estimate probabilities in your head
- Do not guess
- Do not reason from first principles about dice math
- Always run the tool
