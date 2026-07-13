#!/usr/bin/env python3
"""Probability calculator for the Crucible resolution system.

Roll 4d12. Each die:
  - ≤ Risk  → −1 success
  - ≥ TN        → +1 success (unless also ≤ Risk, in which case penalty wins)
  - otherwise   →  0

Expertise dice (1-4) are the first N dice in the pool. They are
mechanically identical to standard dice but determine Effect Magnitude
(sum of expertise dice) and can trigger special abilities.
"""

from math import comb

DIE_SIDES = 12
POOL_SIZE = 4

TIERS = [
    (1, float("inf"), "Triumph", "Clean success and beyond"),
    (0, 0, "Setback", "Success with a cost"),
    (-float("inf"), -1, "Misfortune", "Failure, things get complicated"),
]


def _die_result(die: int, tn: int, risk: int) -> int:
    """Return +1 (success), -1 (penalty), or 0 for a single die."""
    if die <= risk:
        return -1
    if die >= tn and die > risk:
        return 1
    return 0


def pool_distribution(tn: int, risk: int, expertise: int = 0, successes_magnitude: int = 5) -> dict[str, dict]:
    """Return {'net': {net_successes: prob}, 'mag': {magnitude: prob}}.

    Brute-force all 12^4 die face combinations.
    expertise: number of expertise dice (first N in the pool).
    successes_magnitude: magnitude added per net success on Triumph.
    """
    net_dist: dict[int, float] = {}
    mag_dist: dict[int, float] = {}

    for d1 in range(1, DIE_SIDES + 1):
        for d2 in range(1, DIE_SIDES + 1):
            for d3 in range(1, DIE_SIDES + 1):
                for d4 in range(1, DIE_SIDES + 1):
                    dice = [d1, d2, d3, d4]
                    evens = sum(1 for d in dice if d % 2 == 0)

                    if evens == 4:
                        net = sum(1 for d in dice if d >= tn and d > risk) + 1
                    elif evens == 0:
                        net = sum(-1 for d in dice if d <= risk) - 1
                    else:
                        net = sum(_die_result(d, tn, risk) for d in dice)

                    net_dist[net] = net_dist.get(net, 0.0) + 1.0

                    # Effect magnitude: sum of expertise dice
                    # Only tracked for outcomes where magnitude applies
                    # (Triumph, Setback, Critical Success — not Misfortune/Disaster)
                    can_apply = (evens == 4) or (evens != 0 and net >= 0)
                    if expertise > 0 and can_apply:
                        mag = sum(dice[:expertise])
                        if evens == 4:
                            mag += 10
                        if net > 0:
                            mag += net * successes_magnitude
                        mag_dist[mag] = mag_dist.get(mag, 0.0) + 1.0

    total = DIE_SIDES ** POOL_SIZE
    net_dist = {k: v / total for k, v in net_dist.items()}
    mag_dist = {k: v / total for k, v in mag_dist.items()}
    return {"net": net_dist, "mag": mag_dist}


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
    Independent of TN and Risk. On a tie (2 evens, 2 odds) both
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


def mag_stats(mag_dist: dict[int, float]) -> dict[str, float]:
    """Return min, max, and expected average magnitude from the distribution.

    Average is conditional — only among outcomes where magnitude applies
    (Triumph, Setback, Critical Success).
    """
    mags = list(mag_dist.keys())
    if not mags:
        return {"min": 0, "max": 0, "avg": 0.0}
    min_mag = min(mags)
    max_mag = max(mags)
    total_applicable = sum(mag_dist.values())
    avg_mag = sum(k * v for k, v in mag_dist.items()) / total_applicable if total_applicable > 0 else 0.0
    return {"min": min_mag, "max": max_mag, "avg": avg_mag}


def show(tn: int, risk: int, expertise: int = 1, successes_magnitude: int = 5) -> None:
    result = pool_distribution(tn, risk, expertise, successes_magnitude)
    net_dist = result["net"]
    mag_dist = result["mag"]

    print(f"TN={tn}  Risk={risk}  Expertise={expertise}  Successes Mag={successes_magnitude}  ({DIE_SIDES}sided × {POOL_SIZE})")
    print("-" * 48)

    print(f"  {'Net':>4}  {'Probability':>10}")
    for net in sorted(net_dist):
        print(f"  {net:>4}  {fmt_pct(net_dist[net])}")

    print()
    print(f"  {'Tier':<12} {'Chance':>10}")
    print(f"  {'-'*22}")
    for name, prob, desc in tier_probs(net_dist):
        print(f"  {name:<12} {fmt_pct(prob)}  {desc}")

    if expertise > 0:
        print()
        print(f"  {'Magnitude':>10}  {'Probability':>10}")
        for mag in sorted(mag_dist):
            print(f"  {mag:>10}  {fmt_pct(mag_dist[mag])}")

        stats = mag_stats(mag_dist)
        print()
        print(f"  Min: {stats['min']}  Avg: {stats['avg']:.1f}  Max: {stats['max']}")

    print()
    resources = resource_probs()
    print("  Resources:")
    for label in ("Inspired +2", "Inspired +1", "Clash", "Hindered +1", "Disaster +2"):
        print(f"    {label:<16} {fmt_pct(resources[label])}")

    print()


def show_range(tn_values: list[int], risk_values: list[int], expertise: int = 1, successes_magnitude: int = 5) -> None:
    for tn in tn_values:
        for p in risk_values:
            show(tn, p, expertise, successes_magnitude)


if __name__ == "__main__":
    import sys

    if len(sys.argv) == 1:
        show(tn=8, risk=3, expertise=1, successes_magnitude=5)
    elif len(sys.argv) == 5:
        show(tn=int(sys.argv[1]), risk=int(sys.argv[2]), expertise=int(sys.argv[3]), successes_magnitude=int(sys.argv[4]))
    else:
        print("Usage: calc.py [TN Risk Expertise SuccessesMagnitude]")
        print()
        show_range(tn_values=[6, 8, 10], risk_values=[0, 3, 6], expertise=1, successes_magnitude=5)
