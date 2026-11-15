import { convertMinor, RATE_SCALE } from "./money";
import { allocateByWeights, type AllocatedShare } from "./split";

export interface BalanceExpense {
  amountMinor: number;
  currency: string;
  paidByMemberId: string;
  /** Shares in the expense currency. They must sum to amountMinor. */
  shares: readonly AllocatedShare[];
}

export interface BalanceSettlement {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
}

export interface RateBook {
  defaultCurrency: string;
  defaultExponent: number;
  exponents: Readonly<Record<string, number>>;
  /** Major-to-major rates into the default currency, scaled by RATE_SCALE. */
  rates: Readonly<Record<string, bigint>>;
}

export interface MemberBalance {
  memberId: string;
  balanceMinor: number;
}

export type BalanceComputation =
  | { ok: true; balances: MemberBalance[]; totalSpentMinor: number }
  | { ok: false; missingCurrencies: string[] };

function exponentFor(book: RateBook, currency: string): number | null {
  if (currency === book.defaultCurrency) return book.defaultExponent;
  const exponent = book.exponents[currency];
  return exponent === undefined ? null : exponent;
}

function rateFor(book: RateBook, currency: string): bigint | null {
  if (currency === book.defaultCurrency) return RATE_SCALE;
  const rate = book.rates[currency];
  if (rate === undefined || rate <= 0n) return null;
  return rate;
}

function sortLikeMembers<T extends { memberId: string }>(
  rows: readonly T[],
  memberIds: readonly string[],
): T[] {
  const index = new Map(memberIds.map((id, position) => [id, position]));
  return rows.slice().sort((a, b) => {
    const ai = index.get(a.memberId) ?? Number.MAX_SAFE_INTEGER;
    const bi = index.get(b.memberId) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
}

/**
 * Net balance of each person in the trip's default currency.
 * Each expense is converted once, then the converted total is split with the
 * same weights as the original shares so the cents still add up.
 * Positive means the group owes that person.
 */
export function computeBalances(input: {
  memberIds: readonly string[];
  expenses: readonly BalanceExpense[];
  settlements: readonly BalanceSettlement[];
  book: RateBook;
}): BalanceComputation {
  const missing = new Set<string>();
  const currencies = new Set<string>();
  for (const expense of input.expenses) currencies.add(expense.currency);
  for (const settlement of input.settlements) currencies.add(settlement.currency);
  for (const currency of currencies) {
    if (exponentFor(input.book, currency) === null || rateFor(input.book, currency) === null) {
      missing.add(currency);
    }
  }
  if (missing.size > 0) {
    return { ok: false, missingCurrencies: [...missing].sort() };
  }

  const nets = new Map<string, number>();
  for (const memberId of input.memberIds) nets.set(memberId, 0);

  const add = (memberId: string, delta: number) => {
    const next = (nets.get(memberId) ?? 0) + delta;
    if (!Number.isSafeInteger(next)) {
      throw new Error("Balances exceed the safe integer range");
    }
    nets.set(memberId, next);
  };

  let totalSpentMinor = 0;

  for (const expense of input.expenses) {
    if (!Number.isSafeInteger(expense.amountMinor) || expense.amountMinor <= 0) {
      throw new Error("Expense amount must be a positive safe integer");
    }
    const shareSum = expense.shares.reduce((sum, share) => sum + share.amountMinor, 0);
    if (shareSum !== expense.amountMinor) {
      throw new Error("Expense shares must add up to the expense amount");
    }
    const fromExponent = exponentFor(input.book, expense.currency);
    const rate = rateFor(input.book, expense.currency);
    if (fromExponent === null || rate === null) {
      throw new Error("Missing exchange rate");
    }
    const converted = convertMinor({
      amountMinor: expense.amountMinor,
      fromExponent,
      toExponent: input.book.defaultExponent,
      rateScaled: rate,
    });
    const nextSpent = totalSpentMinor + converted;
    if (!Number.isSafeInteger(nextSpent)) throw new Error("Spent total is too large");
    totalSpentMinor = nextSpent;

    const weights = sortLikeMembers(
      expense.shares.filter((share) => share.amountMinor > 0),
      input.memberIds,
    );
    const allocated = allocateByWeights(
      converted,
      weights.map((share) => ({ memberId: share.memberId, weight: share.amountMinor })),
    );
    add(expense.paidByMemberId, converted);
    for (const share of allocated) add(share.memberId, -share.amountMinor);
  }

  for (const settlement of input.settlements) {
    if (!Number.isSafeInteger(settlement.amountMinor) || settlement.amountMinor <= 0) {
      throw new Error("Settlement amount must be a positive safe integer");
    }
    if (settlement.fromMemberId === settlement.toMemberId) {
      throw new Error("A settlement must be between two different people");
    }
    const fromExponent = exponentFor(input.book, settlement.currency);
    const rate = rateFor(input.book, settlement.currency);
    if (fromExponent === null || rate === null) {
      throw new Error("Missing exchange rate");
    }
    const converted = convertMinor({
      amountMinor: settlement.amountMinor,
      fromExponent,
      toExponent: input.book.defaultExponent,
      rateScaled: rate,
    });
    add(settlement.fromMemberId, converted);
    add(settlement.toMemberId, -converted);
  }

  const known = new Set(input.memberIds);
  const extras = [...nets.keys()].filter((id) => !known.has(id)).sort();
  const balances: MemberBalance[] = [...input.memberIds, ...extras].map((memberId) => ({
    memberId,
    balanceMinor: nets.get(memberId) ?? 0,
  }));

  const netSum = balances.reduce((sum, line) => sum + line.balanceMinor, 0);
  if (netSum !== 0) throw new Error("Balance invariant failed: nets must sum to zero");

  return { ok: true, balances, totalSpentMinor };
}
