import { describe, expect, it } from "vitest";
import { allocateByWeights, computeSplit, equalBasisPoints } from "./split";

function sumShares(shares: { amountMinor: number }[]): number {
  return shares.reduce((total, share) => total + share.amountMinor, 0);
}

describe("allocateByWeights", () => {
  it("gives leftover cents to earlier people when remainders tie", () => {
    for (const amount of [1, 2, 3, 99, 100, 101, 999, 10_000]) {
      for (const count of [1, 2, 3, 7, 12]) {
        const shares = allocateByWeights(
          amount,
          Array.from({ length: count }, (_, index) => ({ memberId: `m${index}`, weight: 1 })),
        );
        expect(sumShares(shares)).toBe(amount);
        const base = Math.floor(amount / count);
        const extra = amount % count;
        shares.forEach((share, index) => {
          expect(share.amountMinor).toBe(base + (index < extra ? 1 : 0));
        });
      }
    }
  });

  it("mirrors a negative amount so a refund still sums exactly", () => {
    const shares = allocateByWeights(-100, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 1 },
      { memberId: "c", weight: 1 },
    ]);
    expect(shares.map((share) => share.amountMinor)).toEqual([-34, -33, -33]);
    expect(sumShares(shares)).toBe(-100);

    const tiny = allocateByWeights(-2, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 1 },
      { memberId: "c", weight: 1 },
    ]);
    expect(tiny.map((share) => share.amountMinor)).toEqual([-1, -1, 0]);
  });

  it("uses the largest fractional remainder, then input order", () => {
    const shares = allocateByWeights(100, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 2 },
    ]);
    expect(shares.map((share) => share.amountMinor)).toEqual([33, 67]);

    const oneCent = allocateByWeights(1, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 2 },
    ]);
    expect(oneCent.map((share) => share.amountMinor)).toEqual([0, 1]);
  });

  it("changes who receives a tied cent when the input order changes", () => {
    const forward = allocateByWeights(100, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 1 },
      { memberId: "c", weight: 1 },
    ]);
    const reversed = allocateByWeights(100, [
      { memberId: "c", weight: 1 },
      { memberId: "b", weight: 1 },
      { memberId: "a", weight: 1 },
    ]);
    expect(forward.map((share) => share.amountMinor)).toEqual([34, 33, 33]);
    expect(reversed[0]).toEqual({ memberId: "c", amountMinor: 34 });
  });

  it("keeps arbitrary positive weights summing to the original amount", () => {
    for (const amount of [1, 50, 100, 999]) {
      const shares = allocateByWeights(amount, [
        { memberId: "a", weight: 1 },
        { memberId: "b", weight: 2 },
        { memberId: "c", weight: 3 },
      ]);
      expect(sumShares(shares)).toBe(amount);
    }
  });
});

describe("computeSplit", () => {
  it("splits equally and rejects an empty group", () => {
    const result = computeSplit({
      amountMinor: 100,
      mode: "equal",
      parts: [
        { memberId: "a", value: 1 },
        { memberId: "b", value: 1 },
        { memberId: "c", value: 1 },
      ],
    });
    expect(result).toEqual({
      ok: true,
      shares: [
        { memberId: "a", amountMinor: 34 },
        { memberId: "b", amountMinor: 33 },
        { memberId: "c", amountMinor: 33 },
      ],
    });
    expect(computeSplit({ amountMinor: 100, mode: "equal", parts: [] }).ok).toBe(false);
    expect(computeSplit({ amountMinor: 0, mode: "equal", parts: [{ memberId: "a", value: 1 }] }).ok).toBe(
      false,
    );
  });

  it("requires exact amounts to add up", () => {
    expect(
      computeSplit({
        amountMinor: 1000,
        mode: "exact",
        parts: [
          { memberId: "a", value: 400 },
          { memberId: "b", value: 600 },
        ],
      }),
    ).toEqual({
      ok: true,
      shares: [
        { memberId: "a", amountMinor: 400 },
        { memberId: "b", amountMinor: 600 },
      ],
    });

    const mismatch = computeSplit({
      amountMinor: 1000,
      mode: "exact",
      parts: [
        { memberId: "a", value: 400 },
        { memberId: "b", value: 500 },
      ],
    });
    expect(mismatch).toEqual({
      ok: false,
      error: "Exact amounts must add up to the expense total.",
    });
  });

  it("splits percentages that are not a clean fraction of the amount", () => {
    const halves = computeSplit({
      amountMinor: 101,
      mode: "percentage",
      parts: [
        { memberId: "a", value: 5000 },
        { memberId: "b", value: 5000 },
      ],
    });
    expect(halves).toEqual({
      ok: true,
      shares: [
        { memberId: "a", amountMinor: 51 },
        { memberId: "b", amountMinor: 50 },
      ],
    });

    const uneven = computeSplit({
      amountMinor: 100,
      mode: "percentage",
      parts: [
        { memberId: "a", value: 1 },
        { memberId: "b", value: 9999 },
      ],
    });
    expect(uneven.ok).toBe(true);
    if (uneven.ok) expect(sumShares(uneven.shares)).toBe(100);

    const short = computeSplit({
      amountMinor: 100,
      mode: "percentage",
      parts: [
        { memberId: "a", value: 3333 },
        { memberId: "b", value: 3333 },
        { memberId: "c", value: 3333 },
      ],
    });
    expect(short).toEqual({ ok: false, error: "Percentages must add up to 100%." });
  });

  it("builds equal percentages that sum to 10000 basis points", () => {
    const parts = equalBasisPoints(["a", "b", "c"]);
    expect(parts.map((part) => part.value)).toEqual([3334, 3333, 3333]);
    const result = computeSplit({ amountMinor: 100, mode: "percentage", parts });
    expect(result.ok).toBe(true);
    if (result.ok) expect(sumShares(result.shares)).toBe(100);
  });

  it("splits by shares and rejects an all-zero share list", () => {
    const result = computeSplit({
      amountMinor: 100,
      mode: "shares",
      parts: [
        { memberId: "a", value: 1 },
        { memberId: "b", value: 2 },
      ],
    });
    expect(result).toEqual({
      ok: true,
      shares: [
        { memberId: "a", amountMinor: 33 },
        { memberId: "b", amountMinor: 67 },
      ],
    });
    expect(
      computeSplit({
        amountMinor: 100,
        mode: "shares",
        parts: [
          { memberId: "a", value: 0 },
          { memberId: "b", value: 0 },
        ],
      }).ok,
    ).toBe(false);
  });
});
