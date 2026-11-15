import type { ExpenseRecord, MemberRecord, SettlementRecord, TripBundle } from "./types";
import { computeBalances, type BalanceComputation, type RateBook } from "../lib/balance";
import { getCurrency } from "../lib/currency";
import { convertMinor, RATE_SCALE } from "../lib/money";
import { orderByMembers, sortMembers } from "../lib/members";
import { simplifyDebts, type DebtTransfer } from "../lib/simplify";
import { computeSplit, type AllocatedShare } from "../lib/split";

export interface ExpenseProjection {
  record: ExpenseRecord;
  shares: AllocatedShare[] | null;
  error: string | null;
}

export interface TripProjection {
  members: MemberRecord[];
  expenses: ExpenseProjection[];
  settlements: SettlementRecord[];
  balance: BalanceComputation;
  transfers: DebtTransfer[];
  problem: string | null;
}

export function foreignCurrencies(bundle: TripBundle): string[] {
  const codes = new Set<string>();
  for (const expense of bundle.expenses) {
    if (expense.currency !== bundle.trip.defaultCurrency) codes.add(expense.currency);
  }
  for (const settlement of bundle.settlements) {
    if (settlement.currency !== bundle.trip.defaultCurrency) codes.add(settlement.currency);
  }
  return [...codes].sort();
}

export function rateBook(bundle: TripBundle): RateBook {
  const rates: Record<string, bigint> = {};
  for (const rate of bundle.rates) {
    if (/^[1-9]\d{0,17}$/.test(rate.rateScaled)) rates[rate.currency] = BigInt(rate.rateScaled);
  }
  const currencies = new Set<string>([bundle.trip.defaultCurrency]);
  for (const expense of bundle.expenses) currencies.add(expense.currency);
  for (const settlement of bundle.settlements) currencies.add(settlement.currency);
  const exponents: Record<string, number> = {};
  for (const code of currencies) exponents[code] = getCurrency(code).exponent;
  return {
    defaultCurrency: bundle.trip.defaultCurrency,
    defaultExponent: getCurrency(bundle.trip.defaultCurrency).exponent,
    exponents,
    rates,
  };
}

export function toDefaultMinor(bundle: TripBundle, amountMinor: number, currency: string): number | null {
  const book = rateBook(bundle);
  const rate = currency === book.defaultCurrency ? RATE_SCALE : book.rates[currency];
  const exponent = book.exponents[currency];
  if (rate === undefined || exponent === undefined) return null;
  return convertMinor({
    amountMinor,
    fromExponent: exponent,
    toExponent: book.defaultExponent,
    rateScaled: rate,
  });
}

export function projectTrip(bundle: TripBundle): TripProjection {
  const members = sortMembers(bundle.members);
  const memberIds = members.map((member) => member.id);
  const expenses = bundle.expenses.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
  const settlements = bundle.settlements.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.createdAt - a.createdAt;
  });

  const projected: ExpenseProjection[] = [];
  let problem: string | null = null;
  for (const expense of expenses) {
    const split = computeSplit({
      amountMinor: expense.amountMinor,
      mode: expense.splitMode,
      parts: orderByMembers(expense.parts, members),
    });
    if (!split.ok) {
      problem = `${expense.description}: ${split.error}`;
      projected.push({ record: expense, shares: null, error: split.error });
    } else {
      projected.push({ record: expense, shares: split.shares, error: null });
    }
  }

  if (problem) {
    return {
      members,
      expenses: projected,
      settlements,
      balance: { ok: false, missingCurrencies: [] },
      transfers: [],
      problem,
    };
  }

  const balance = computeBalances({
    memberIds,
    expenses: projected.map((expense) => ({
      amountMinor: expense.record.amountMinor,
      currency: expense.record.currency,
      paidByMemberId: expense.record.paidByMemberId,
      shares: expense.shares ?? [],
    })),
    settlements: settlements.map((settlement) => ({
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
    })),
    book: rateBook(bundle),
  });

  return {
    members,
    expenses: projected,
    settlements,
    balance,
    transfers: balance.ok ? simplifyDebts(balance.balances) : [],
    problem: null,
  };
}
