import type { SplitMode, SplitPart } from "../lib/split";

export interface TripRecord {
  id: string;
  name: string;
  defaultCurrency: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemberRecord {
  id: string;
  tripId: string;
  name: string;
  createdAt: number;
}

export interface RateRecord {
  id: string;
  tripId: string;
  currency: string;
  /** Positive integer string: major-to-major rate scaled by 1e8. */
  rateScaled: string;
  updatedAt: number;
}

export interface ExpenseRecord {
  id: string;
  tripId: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  paidByMemberId: string;
  splitMode: SplitMode;
  parts: SplitPart[];
  createdAt: number;
  updatedAt: number;
}

export interface SettlementRecord {
  id: string;
  tripId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
  date: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface TripBundle {
  trip: TripRecord;
  members: MemberRecord[];
  expenses: ExpenseRecord[];
  settlements: SettlementRecord[];
  rates: RateRecord[];
}

export interface ExpenseDraft {
  id?: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  paidByMemberId: string;
  splitMode: SplitMode;
  parts: SplitPart[];
}

export interface SettlementDraft {
  id?: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
  date: string;
  note: string;
}

export type Result = { ok: true } | { ok: false; error: string };
export type ResultWithId = { ok: true; id: string } | { ok: false; error: string };
