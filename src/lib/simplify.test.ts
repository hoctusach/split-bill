import { describe, expect, it } from "vitest";
import { simplifyDebts } from "./simplify";

describe("simplifyDebts", () => {
  it("returns nothing when everyone is settled", () => {
    expect(
      simplifyDebts([
        { memberId: "a", balanceMinor: 0 },
        { memberId: "b", balanceMinor: 0 },
      ]),
    ).toEqual([]);
  });

  it("collapses a chain of debts into one payment from the net balances", () => {
    expect(
      simplifyDebts([
        { memberId: "a", balanceMinor: -1000 },
        { memberId: "b", balanceMinor: 0 },
        { memberId: "c", balanceMinor: 1000 },
      ]),
    ).toEqual([{ fromMemberId: "a", toMemberId: "c", amountMinor: 1000 }]);
  });

  it("matches the largest debtor to the largest creditor", () => {
    const transfers = simplifyDebts([
      { memberId: "a", balanceMinor: 3000 },
      { memberId: "b", balanceMinor: -1000 },
      { memberId: "c", balanceMinor: -2000 },
    ]);
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 2000 },
      { fromMemberId: "b", toMemberId: "a", amountMinor: 1000 },
    ]);
  });

  it("needs two payments when two people are owed and two people owe", () => {
    const transfers = simplifyDebts([
      { memberId: "a", balanceMinor: 500 },
      { memberId: "b", balanceMinor: 500 },
      { memberId: "c", balanceMinor: -500 },
      { memberId: "d", balanceMinor: -500 },
    ]);
    expect(transfers).toHaveLength(2);
    expect(transfers.reduce((sum, transfer) => sum + transfer.amountMinor, 0)).toBe(1000);
  });

  it("breaks amount ties by member id", () => {
    const transfers = simplifyDebts([
      { memberId: "b", balanceMinor: 500 },
      { memberId: "a", balanceMinor: 500 },
      { memberId: "d", balanceMinor: -400 },
      { memberId: "c", balanceMinor: -600 },
    ]);
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 500 },
      { fromMemberId: "c", toMemberId: "b", amountMinor: 100 },
      { fromMemberId: "d", toMemberId: "b", amountMinor: 400 },
    ]);
  });

  it("refuses balances that do not sum to zero", () => {
    expect(() => simplifyDebts([{ memberId: "a", balanceMinor: 10 }])).toThrow(/sum to zero/);
  });
});
