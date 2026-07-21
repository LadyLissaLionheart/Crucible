#!/usr/bin/env python3
"""Dice probability calculator for the success-counting RPG system.

The core roll: roll N dice of size `die`, count dice >= TN as successes.

Usage examples
--------------
# Report a specific pool
python dice_calc.py --dice 5 --die 12 --tn 11

# Search for the pool that best matches target probabilities (1+/2+/3+)
python dice_calc.py --search --p1 0.55 --p2 0.20 --p3 0.05

# Print a probability table (rows = TN, cols = dice count)
python dice_calc.py --table --metric atleast --k 2 --dice-range 2-8 --tn-range 12-5
"""

import argparse
import math


def p_success(die_size: int, tn: int) -> float:
    """Chance a single die shows >= TN (TN in [1, die_size])."""
    if tn > die_size:
        return 0.0
    if tn < 1:
        return 1.0
    return (die_size - tn + 1) / die_size


def binom(n: int, k: int, p: float) -> float:
    return math.comb(n, k) * (p ** k) * ((1 - p) ** (n - k))


def at_least(n: int, k: int, p: float) -> float:
    return sum(binom(n, i, p) for i in range(k, n + 1))


def exactly(n: int, k: int, p: float) -> float:
    return binom(n, k, p)


def report(dice: int, die: int, tn: int) -> str:
    p = p_success(die, tn)
    out = [f"{dice}d{die} @ TN {tn}  (p/die = {p:.4f})"]
    for k in range(1, dice + 1):
        out.append(
            f"  >= {k}: {at_least(dice, k, p) * 100:6.2f}%   "
            f"== {k}: {exactly(dice, k, p) * 100:6.2f}%"
        )
    return "\n".join(out)


def search(targets, die=12, tn_range=range(5, 13), dice_range=range(1, 13)):
    """Return (error, dice, tn, [p1, p2, p3]) for the best-fit pool."""
    best = None
    for dice in dice_range:
        for tn in tn_range:
            p = p_success(die, tn)
            vals = [at_least(dice, k, p) for k in (1, 2, 3)]
            err = sum(abs(v - t) for v, t in zip(vals, targets))
            if best is None or err < best[0]:
                best = (err, dice, tn, vals)
    return best


def table(metric, k, dice_lo, dice_hi, tn_lo, tn_hi, die=12):
    rows = list(range(tn_hi, tn_lo - 1, -1))
    fn = at_least if metric == "atleast" else exactly
    header = "TN\\dice " + " ".join(f"{d:>7}" for d in range(dice_lo, dice_hi + 1))
    lines = [header]
    for tn in rows:
        p = p_success(die, tn)
        cells = []
        for d in range(dice_lo, dice_hi + 1):
            val = fn(d, k, p)
            cells.append(f"{val * 100:6.2f}%")
        lines.append(f"{tn:>7} " + " ".join(cells))
    return "\n".join(lines)


def _parse_range(spec: str):
    lo, hi = (int(x) for x in spec.split("-"))
    return lo, hi


def main():
    ap = argparse.ArgumentParser(description="Success-counting dice calculator.")
    ap.add_argument("--dice", type=int, help="number of dice")
    ap.add_argument("--die", type=int, default=12, help="die size (default 12)")
    ap.add_argument("--tn", type=int, help="target number")
    ap.add_argument("--search", action="store_true", help="find best-fit pool")
    ap.add_argument("--p1", type=float, default=0.55)
    ap.add_argument("--p2", type=float, default=0.20)
    ap.add_argument("--p3", type=float, default=0.05)
    ap.add_argument("--table", action="store_true", help="print a TN x dice table")
    ap.add_argument("--metric", choices=["atleast", "exactly"], default="atleast")
    ap.add_argument("--k", type=int, default=2)
    ap.add_argument("--dice-range", default="2-8")
    ap.add_argument("--tn-range", default="12-5")
    args = ap.parse_args()

    if args.search:
        dlo, dhi = _parse_range(args.dice_range)
        tlo, thi = _parse_range(args.tn_range)
        dlo, dhi = min(dlo, dhi), max(dlo, dhi)
        tlo, thi = min(tlo, thi), max(tlo, thi)
        err, dice, tn, vals = search(
            (args.p1, args.p2, args.p3),
            die=args.die,
            dice_range=range(dlo, dhi + 1),
            tn_range=range(tlo, thi + 1),
        )
        print(f"Best match for targets >=1={args.p1}, >=2={args.p2}, >=3={args.p3}:")
        print(report(dice, args.die, tn))
        print(
            f"  (targets: {args.p1 * 100:.0f}% / {args.p2 * 100:.0f}% / "
            f"{args.p3 * 100:.0f}%)"
        )
        return

    if args.table:
        dlo, dhi = _parse_range(args.dice_range)
        tlo, thi = _parse_range(args.tn_range)
        print(
            table(args.metric, args.k, dlo, dhi, tlo, thi, die=args.die)
        )
        return

    if args.dice and args.tn:
        print(report(args.dice, args.die, args.tn))
        return

    ap.print_help()


if __name__ == "__main__":
    main()
