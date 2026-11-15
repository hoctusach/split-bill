export interface BalanceLine {
  memberId: string;
  /** Positive: the group owes this person. Negative: this person owes the group. */
  balanceMinor: number;
}

export interface DebtTransfer {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

/**
 * Minimum set of payments that settle every net balance.
 * Matches the largest remaining debtor with the largest remaining creditor.
 * Ties break by member id so the same balances always produce the same list.
 * The result has at most one payment fewer than the number of people with a non-zero balance.
 */
export function simplifyDebts(balances: readonly BalanceLine[]): DebtTransfer[] {
  let sum = 0;
  for (const line of balances) {
    if (!Number.isSafeInteger(line.balanceMinor)) {
      throw new Error("Balance must be a safe integer");
    }
    sum += line.balanceMinor;
  }
  if (!Number.isSafeInteger(sum)) throw new Error("Balances overflowed");
  if (sum !== 0) throw new Error("Balances must sum to zero before they can be simplified");

  const debtors: { memberId: string; amount: number }[] = [];
  const creditors: { memberId: string; amount: number }[] = [];
  for (const line of balances) {
    if (line.balanceMinor < 0) {
      debtors.push({ memberId: line.memberId, amount: -line.balanceMinor });
    } else if (line.balanceMinor > 0) {
      creditors.push({ memberId: line.memberId, amount: line.balanceMinor });
    }
  }

  const byAmountThenId = (
    a: { memberId: string; amount: number },
    b: { memberId: string; amount: number },
  ) => {
    if (a.amount !== b.amount) return b.amount - a.amount;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  };
  debtors.sort(byAmountThenId);
  creditors.sort(byAmountThenId);

  const transfers: DebtTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    if (!debtor || !creditor) break;
    const pay = Math.min(debtor.amount, creditor.amount);
    if (pay > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountMinor: pay,
      });
    }
    debtor.amount -= pay;
    creditor.amount -= pay;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return transfers;
}
