import { describe, expect, it } from "vitest";
import { computeBalances, type RateBook } from "./balance";
import { parseRateToScaled } from "./money";
import { simplifyDebts } from "./simplify";
import { computeSplit } from "./split";

const eurBook: RateBook = {
  defaultCurrency: "EUR",
  defaultExponent: 2,
  exponents: { USD: 2, JPY: 0 },
  rates: {},
};

describe("computeBalances", () => {
  it("nets an equal expense to zero and suggests the minimum payments", () => {
    const split = computeSplit({
      amountMinor: 1000,
      mode: "equal",
      parts: [
        { memberId: "a", value: 1 },
        { memberId: "b", value: 1 },
        { memberId: "c", value: 1 },
      ],
    });
    expect(split.ok).toBe(true);
    if (!split.ok) return;

    const result = computeBalances({
      memberIds: ["a", "b", "c"],
      expenses: [
        {
          amountMinor: 1000,
          currency: "EUR",
          paidByMemberId: "a",
          shares: split.shares,
        },
      ],
      settlements: [],
      book: eurBook,
    });
    expect(result).toEqual({
      ok: true,
      totalSpentMinor: 1000,
      balances: [
        { memberId: "a", balanceMinor: 666 },
        { memberId: "b", balanceMinor: -333 },
        { memberId: "c", balanceMinor: -333 },
      ],
    });
    if (!result.ok) return;
    expect(simplifyDebts(result.balances)).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountMinor: 333 },
      { fromMemberId: "c", toMemberId: "a", amountMinor: 333 },
    ]);
  });

  it("lets someone pay without being part of the split", () => {
    const result = computeBalances({
      memberIds: ["a", "b"],
      expenses: [
        {
          amountMinor: 500,
          currency: "EUR",
          paidByMemberId: "a",
          shares: [{ memberId: "b", amountMinor: 500 }],
        },
      ],
      settlements: [],
      book: eurBook,
    });
    expect(result).toEqual({
      ok: true,
      totalSpentMinor: 500,
      balances: [
        { memberId: "a", balanceMinor: 500 },
        { memberId: "b", balanceMinor: -500 },
      ],
    });
  });

  it("clears a debt when the suggested settlement is recorded", () => {
    const open = computeBalances({
      memberIds: ["a", "b", "c"],
      expenses: [
        {
          amountMinor: 1000,
          currency: "EUR",
          paidByMemberId: "a",
          shares: [
            { memberId: "a", amountMinor: 334 },
            { memberId: "b", amountMinor: 333 },
            { memberId: "c", amountMinor: 333 },
          ],
        },
      ],
      settlements: [{ fromMemberId: "c", toMemberId: "a", amountMinor: 333, currency: "EUR" }],
      book: eurBook,
    });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(open.balances).toEqual([
      { memberId: "a", balanceMinor: 333 },
      { memberId: "b", balanceMinor: -333 },
      { memberId: "c", balanceMinor: 0 },
    ]);
    expect(simplifyDebts(open.balances)).toEqual([
      { fromMemberId: "b", toMemberId: "a", amountMinor: 333 },
    ]);
  });

  it("converts a foreign expense once, then splits that total, so no cent is invented", () => {
    const jpySplit = computeSplit({
      amountMinor: 100,
      mode: "equal",
      parts: [
        { memberId: "a", value: 1 },
        { memberId: "b", value: 1 },
      ],
    });
    expect(jpySplit.ok).toBe(true);
    if (!jpySplit.ok) return;

    const eurSplit = computeSplit({
      amountMinor: 1000,
      mode: "equal",
      parts: [
        { memberId: "a", value: 1 },
        { memberId: "b", value: 1 },
        { memberId: "c", value: 1 },
      ],
    });
    expect(eurSplit.ok).toBe(true);
    if (!eurSplit.ok) return;

    const result = computeBalances({
      memberIds: ["a", "b", "c"],
      expenses: [
        {
          amountMinor: 1000,
          currency: "EUR",
          paidByMemberId: "a",
          shares: eurSplit.shares,
        },
        {
          amountMinor: 100,
          currency: "JPY",
          paidByMemberId: "b",
          shares: jpySplit.shares,
        },
      ],
      settlements: [],
      book: {
        ...eurBook,
        rates: { JPY: parseRateToScaled("0.0067")! },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalSpentMinor).toBe(1000 + 67);
    expect(result.balances).toEqual([
      { memberId: "a", balanceMinor: 632 },
      { memberId: "b", balanceMinor: -299 },
      { memberId: "c", balanceMinor: -333 },
    ]);
    expect(result.balances.reduce((sum, line) => sum + line.balanceMinor, 0)).toBe(0);
  });

  it("reports every currency that still needs a rate and does not invent a balance", () => {
    const result = computeBalances({
      memberIds: ["a"],
      expenses: [
        {
          amountMinor: 100,
          currency: "USD",
          paidByMemberId: "a",
          shares: [{ memberId: "a", amountMinor: 100 }],
        },
      ],
      settlements: [{ fromMemberId: "a", toMemberId: "b", amountMinor: 50, currency: "JPY" }],
      book: eurBook,
    });
    expect(result).toEqual({ ok: false, missingCurrencies: ["JPY", "USD"] });
  });

  it("keeps a partial settlement in another currency on the same cent-safe rails", () => {
    const result = computeBalances({
      memberIds: ["a", "b"],
      expenses: [
        {
          amountMinor: 1000,
          currency: "EUR",
          paidByMemberId: "a",
          shares: [
            { memberId: "a", amountMinor: 0 },
            { memberId: "b", amountMinor: 1000 },
          ],
        },
      ],
      settlements: [{ fromMemberId: "b", toMemberId: "a", amountMinor: 500, currency: "USD" }],
      book: {
        ...eurBook,
        rates: { USD: parseRateToScaled("0.92")! },
      },
    });
    expect(result).toEqual({
      ok: true,
      totalSpentMinor: 1000,
      balances: [
        { memberId: "a", balanceMinor: 540 },
        { memberId: "b", balanceMinor: -540 },
      ],
    });
  });
});
