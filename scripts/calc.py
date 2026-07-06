#!/usr/bin/env python3
"""Probability calculator for the Secondary Design resolution system.

Roll 4d12. Each die:
  - ≤ Difficulty  → −1 success
  - ≥ TN        → +1 success (unless also ≤ Difficulty, in which case penalty wins)
  - otherwise   →  0
"""

from math import comb

DIE_SIDES = 12
POOL_SIZE = 4

TIERS = [
    (1, float("inf"), "Triumph", "Clean success and beyond"),
    (0, 0, "Setback", "Success with a cost"),
    (-float("inf"), -1, "Misfortune", "Failure, things get complicated"),
]


def pool_distribution(tn: int, difficulty: int) -> dict[int, float]:
    """Return {net_successes: probability} for a full pool.

    Brute-force all 12^4 die face combinations. 4 evens = auto net +4,
    4 odds = auto net −4. Everything else uses the normal TN/Difficulty
    calculation.
    """
    dist: dict[int, float] = {}
    for d1 in range(1, DIE_SIDES + 1):
        for d2 in range(1, DIE_SIDES + 1):
            for d3 in range(1, DIE_SIDES + 1):
                for d4 in range(1, DIE_SIDES + 1):
                    evens = (d1 % 2 == 0) + (d2 % 2 == 0) + (d3 % 2 == 0) + (d4 % 2 == 0)
                    if evens == 4:
                        net = ((1 if d1 >= tn and d1 > difficulty else 0)
                            + (1 if d2 >= tn and d2 > difficulty else 0)
                            + (1 if d3 >= tn and d3 > difficulty else 0)
                            + (1 if d4 >= tn and d4 > difficulty else 0)) + 1
                    elif evens == 0:
                        net = ((-1 if d1 <= difficulty else 0)
                            + (-1 if d2 <= difficulty else 0)
                            + (-1 if d3 <= difficulty else 0)
                            + (-1 if d4 <= difficulty else 0)) - 1
                    else:
                        net = (
                            (1 if d1 >= tn and d1 > difficulty else -1 if d1 <= difficulty else 0)
                            + (1 if d2 >= tn and d2 > difficulty else -1 if d2 <= difficulty else 0)
                            + (1 if d3 >= tn and d3 > difficulty else -1 if d3 <= difficulty else 0)
                            + (1 if d4 >= tn and d4 > difficulty else -1 if d4 <= difficulty else 0)
                        )
                    dist[net] = dist.get(net, 0.0) + 1.0
    total = DIE_SIDES ** POOL_SIZE
    return {k: v / total for k, v in dist.items()}


def tier_probs(dist: dict[int, float]) -> list[tuple[str, float, str]]:
    """Aggregate net success probabilities into tier probabilities."""
    results = []
    for lo, hi, name, desc in TIERS:
        prob = sum(v for k, v in dist.items() if lo <= k <= hi)
        results.append((name, prob, desc))
    return results


def resource_probs() -> dict[str, float]:
    """Return {label: probability} for each parity outcome.

    Each d12 has 6 evens and 6 odds → binomial with p = 0.5 across 4 dice.
    Independent of TN and Difficulty. On a tie (2 evens, 2 odds) both
    sides gain +1.
    """
    p = 0.5
    probs = {}
    for e in range(POOL_SIZE + 1):
        prob = comb(POOL_SIZE, e) * (p ** e) * ((1 - p) ** (POOL_SIZE - e))
        if e == 4:
            label = "Inspired +2"
        elif e == 3:
            label = "Inspired +1"
        elif e == 2:
            label = "Clash"
        elif e == 1:
            label = "Hindered +1"
        else:
            label = "Disaster +2"
        probs[label] = prob
    return probs


def fmt_pct(p: float) -> str:
    return f"{p * 100:>6.2f}%"


def show(tn: int, difficulty: int) -> None:
    dist = pool_distribution(tn, difficulty)

    print(f"TN={tn}  Difficulty={difficulty}  ({DIE_SIDES}sided × {POOL_SIZE})")
    print("-" * 48)

    print(f"  {'Net':>4}  {'Probability':>10}")
    for net in sorted(dist):
        print(f"  {net:>4}  {fmt_pct(dist[net])}")

    print()
    print(f"  {'Tier':<12} {'Chance':>10}")
    print(f"  {'-'*22}")
    for name, prob, desc in tier_probs(dist):
        print(f"  {name:<12} {fmt_pct(prob)}  {desc}")

    print()
    resources = resource_probs()
    print("  Resources:")
    for label in ("Inspired +2", "Inspired +1", "Clash", "Hindered +1", "Disaster +2"):
        print(f"    {label:<16} {fmt_pct(resources[label])}")

    print()


def show_range(tn_values: list[int], difficulty_values: list[int]) -> None:
    for tn in tn_values:
        for p in difficulty_values:
            show(tn, p)


if __name__ == "__main__":
    import sys

    if len(sys.argv) == 1:
        show(tn=8, difficulty=3)
    elif len(sys.argv) == 3:
        show(tn=int(sys.argv[1]), difficulty=int(sys.argv[2]))
    else:
        print("Usage: calc.py [TN Difficulty]")
        print()
        show_range(tn_values=[6, 8, 10], difficulty_values=[0, 3, 6])
