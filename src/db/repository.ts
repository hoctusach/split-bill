import type { ExpenseDraft, Result, ResultWithId, SettlementDraft, TripBundle } from "../domain/types";
import { cleanText, sameName } from "../domain/text";
import { isKnownCurrency } from "../lib/currency";
import { isIsoDate } from "../lib/dates";
import { parseTripBackup, rekeyBackup, type TripBackup } from "../lib/export";
import { createId } from "../lib/ids";
import { orderByMembers, sortMembers } from "../lib/members";
import { parseRateToScaled } from "../lib/money";
import { computeSplit, type SplitMode } from "../lib/split";
import { db } from "./db";

const SPLIT_MODES = new Set<SplitMode>(["equal", "exact", "percentage", "shares"]);

async function touchTrip(tripId: string, now: number): Promise<void> {
  await db.trips.update(tripId, { updatedAt: now });
}

export async function getTripBundle(tripId: string): Promise<TripBundle | null> {
  const trip = await db.trips.get(tripId);
  if (!trip) return null;
  const [members, expenses, settlements, rates] = await Promise.all([
    db.members.where("tripId").equals(tripId).toArray(),
    db.expenses.where("tripId").equals(tripId).toArray(),
    db.settlements.where("tripId").equals(tripId).toArray(),
    db.rates.where("tripId").equals(tripId).toArray(),
  ]);
  return { trip, members, expenses, settlements, rates };
}

export function tripToBackup(bundle: TripBundle): TripBackup {
  return {
    format: "split-bill",
    version: 1,
    exportedAt: new Date().toISOString(),
    trip: {
      name: bundle.trip.name,
      defaultCurrency: bundle.trip.defaultCurrency,
      createdAt: bundle.trip.createdAt,
      updatedAt: bundle.trip.updatedAt,
    },
    members: sortMembers(bundle.members).map(({ id, name, createdAt }) => ({ id, name, createdAt })),
    rates: bundle.rates.map(({ currency, rateScaled, updatedAt }) => ({ currency, rateScaled, updatedAt })),
    expenses: bundle.expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amountMinor: expense.amountMinor,
      currency: expense.currency,
      date: expense.date,
      paidByMemberId: expense.paidByMemberId,
      splitMode: expense.splitMode,
      parts: expense.parts,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    })),
    settlements: bundle.settlements.map((settlement) => ({
      id: settlement.id,
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
      date: settlement.date,
      note: settlement.note,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
    })),
  };
}

export async function createTrip(input: {
  name: string;
  defaultCurrency: string;
  memberNames: string[];
}): Promise<ResultWithId> {
  const name = cleanText(input.name, 60);
  if (!name) return { ok: false, error: "Give the trip a name, up to 60 characters." };
  if (!isKnownCurrency(input.defaultCurrency)) {
    return { ok: false, error: "Choose a currency from the list." };
  }
  const memberNames: string[] = [];
  for (const raw of input.memberNames) {
    const memberName = cleanText(raw, 40);
    if (!memberName) return { ok: false, error: "Each person needs a name, up to 40 characters." };
    if (memberNames.some((existing) => sameName(existing, memberName))) {
      return { ok: false, error: `${memberName} is listed twice.` };
    }
    memberNames.push(memberName);
  }
  if (memberNames.length === 0) return { ok: false, error: "Add at least one person." };

  const now = Date.now();
  const tripId = createId();
  try {
    await db.transaction("rw", [db.trips, db.members], async () => {
      await db.trips.add({
        id: tripId,
        name,
        defaultCurrency: input.defaultCurrency,
        createdAt: now,
        updatedAt: now,
      });
      await db.members.bulkAdd(
        memberNames.map((memberName, index) => ({
          id: createId(),
          tripId,
          name: memberName,
          createdAt: now + index + 1,
        })),
      );
    });
  } catch {
    return { ok: false, error: "Could not save this trip on this device." };
  }
  return { ok: true, id: tripId };
}

export async function renameTrip(tripId: string, rawName: string): Promise<Result> {
  const name = cleanText(rawName, 60);
  if (!name) return { ok: false, error: "Give the trip a name, up to 60 characters." };
  const trip = await db.trips.get(tripId);
  if (!trip) return { ok: false, error: "This trip is not on this device." };
  await db.trips.update(tripId, { name, updatedAt: Date.now() });
  return { ok: true };
}

export async function deleteTrip(tripId: string): Promise<Result> {
  try {
    await db.transaction("rw", [db.trips, db.members, db.rates, db.expenses, db.settlements], async () => {
      await db.members.where("tripId").equals(tripId).delete();
      await db.rates.where("tripId").equals(tripId).delete();
      await db.expenses.where("tripId").equals(tripId).delete();
      await db.settlements.where("tripId").equals(tripId).delete();
      await db.trips.delete(tripId);
    });
  } catch {
    return { ok: false, error: "Could not delete this trip." };
  }
  return { ok: true };
}

export async function addMember(tripId: string, rawName: string): Promise<Result> {
  const name = cleanText(rawName, 40);
  if (!name) return { ok: false, error: "Enter a name, up to 40 characters." };
  const trip = await db.trips.get(tripId);
  if (!trip) return { ok: false, error: "This trip is not on this device." };
  const members = await db.members.where("tripId").equals(tripId).toArray();
  if (members.length >= 100) return { ok: false, error: "A trip can have up to 100 people." };
  if (members.some((member) => sameName(member.name, name))) {
    return { ok: false, error: "That name is already on this trip." };
  }
  const now = Date.now();
  await db.transaction("rw", [db.members, db.trips], async () => {
    await db.members.add({ id: createId(), tripId, name, createdAt: now });
    await touchTrip(tripId, now);
  });
  return { ok: true };
}

export async function renameMember(memberId: string, rawName: string): Promise<Result> {
  const name = cleanText(rawName, 40);
  if (!name) return { ok: false, error: "Enter a name, up to 40 characters." };
  const member = await db.members.get(memberId);
  if (!member) return { ok: false, error: "That person is not on this device." };
  const members = await db.members.where("tripId").equals(member.tripId).toArray();
  if (members.some((other) => other.id !== memberId && sameName(other.name, name))) {
    return { ok: false, error: "That name is already on this trip." };
  }
  const now = Date.now();
  await db.transaction("rw", [db.members, db.trips], async () => {
    await db.members.update(memberId, { name });
    await touchTrip(member.tripId, now);
  });
  return { ok: true };
}

export async function removeMember(memberId: string): Promise<Result> {
  const member = await db.members.get(memberId);
  if (!member) return { ok: false, error: "That person is not on this device." };
  const members = await db.members.where("tripId").equals(member.tripId).toArray();
  if (members.length <= 1) return { ok: false, error: "A trip needs at least one person." };
  const [expenses, settlements] = await Promise.all([
    db.expenses.where("tripId").equals(member.tripId).toArray(),
    db.settlements.where("tripId").equals(member.tripId).toArray(),
  ]);
  const usedByExpense = expenses.some(
    (expense) =>
      expense.paidByMemberId === memberId || expense.parts.some((part) => part.memberId === memberId),
  );
  const usedBySettlement = settlements.some(
    (settlement) => settlement.fromMemberId === memberId || settlement.toMemberId === memberId,
  );
  if (usedByExpense || usedBySettlement) {
    return {
      ok: false,
      error: `${member.name} is on an expense or payment. Edit those first, then remove them.`,
    };
  }
  await db.transaction("rw", [db.members, db.trips], async () => {
    await db.members.delete(memberId);
    await touchTrip(member.tripId, Date.now());
  });
  return { ok: true };
}

export async function saveRate(tripId: string, currency: string, rateInput: string): Promise<Result> {
  const trip = await db.trips.get(tripId);
  if (!trip) return { ok: false, error: "This trip is not on this device." };
  if (!isKnownCurrency(currency) || currency === trip.defaultCurrency) {
    return { ok: false, error: "Choose a currency other than the trip currency." };
  }
  const rate = parseRateToScaled(rateInput);
  if (!rate) return { ok: false, error: "Enter a rate greater than zero, with at most 8 decimal places." };
  const now = Date.now();
  const existing = await db.rates
    .where("tripId")
    .equals(tripId)
    .filter((row) => row.currency === currency)
    .first();
  await db.transaction("rw", [db.rates, db.trips], async () => {
    if (existing) {
      await db.rates.update(existing.id, { rateScaled: rate.toString(), updatedAt: now });
    } else {
      await db.rates.add({
        id: createId(),
        tripId,
        currency,
        rateScaled: rate.toString(),
        updatedAt: now,
      });
    }
    await touchTrip(tripId, now);
  });
  return { ok: true };
}

export async function saveExpense(tripId: string, draft: ExpenseDraft): Promise<ResultWithId> {
  const trip = await db.trips.get(tripId);
  if (!trip) return { ok: false, error: "This trip is not on this device." };
  const description = cleanText(draft.description, 120);
  if (!description) return { ok: false, error: "Add a short description." };
  if (!isKnownCurrency(draft.currency)) return { ok: false, error: "Choose a currency from the list." };
  if (!isIsoDate(draft.date)) return { ok: false, error: "Choose a valid date." };
  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (!SPLIT_MODES.has(draft.splitMode)) return { ok: false, error: "Choose how to split this expense." };

  const members = await db.members.where("tripId").equals(tripId).toArray();
  const memberIds = new Set(members.map((member) => member.id));
  if (!memberIds.has(draft.paidByMemberId)) {
    return { ok: false, error: "Choose who paid." };
  }
  if (draft.parts.some((part) => !memberIds.has(part.memberId))) {
    return { ok: false, error: "The split includes someone who is not on this trip." };
  }
  const parts = orderByMembers(draft.parts, members);
  const split = computeSplit({ amountMinor: draft.amountMinor, mode: draft.splitMode, parts });
  if (!split.ok) return split;

  const now = Date.now();
  const id = draft.id ?? createId();
  try {
    await db.transaction("rw", [db.expenses, db.trips], async () => {
      const existing = draft.id ? await db.expenses.get(draft.id) : undefined;
      if (draft.id && (!existing || existing.tripId !== tripId)) {
        throw new Error("missing");
      }
      await db.expenses.put({
        id,
        tripId,
        description,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        date: draft.date,
        paidByMemberId: draft.paidByMemberId,
        splitMode: draft.splitMode,
        parts,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await touchTrip(tripId, now);
    });
  } catch {
    return { ok: false, error: "Could not save this expense." };
  }
  return { ok: true, id };
}

export async function deleteExpense(tripId: string, expenseId: string): Promise<Result> {
  const expense = await db.expenses.get(expenseId);
  if (!expense || expense.tripId !== tripId) return { ok: false, error: "That expense is not on this trip." };
  await db.transaction("rw", [db.expenses, db.trips], async () => {
    await db.expenses.delete(expenseId);
    await touchTrip(tripId, Date.now());
  });
  return { ok: true };
}

export async function saveSettlement(tripId: string, draft: SettlementDraft): Promise<ResultWithId> {
  const trip = await db.trips.get(tripId);
  if (!trip) return { ok: false, error: "This trip is not on this device." };
  if (!isKnownCurrency(draft.currency)) return { ok: false, error: "Choose a currency from the list." };
  if (!isIsoDate(draft.date)) return { ok: false, error: "Choose a valid date." };
  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (draft.fromMemberId === draft.toMemberId) {
    return { ok: false, error: "Choose two different people." };
  }
  const note = draft.note.trim().replace(/\s+/g, " ");
  if (note.length > 200) return { ok: false, error: "Keep the note under 200 characters." };
  const members = await db.members.where("tripId").equals(tripId).toArray();
  const memberIds = new Set(members.map((member) => member.id));
  if (!memberIds.has(draft.fromMemberId) || !memberIds.has(draft.toMemberId)) {
    return { ok: false, error: "Choose people who are on this trip." };
  }
  const now = Date.now();
  const id = draft.id ?? createId();
  try {
    await db.transaction("rw", [db.settlements, db.trips], async () => {
      const existing = draft.id ? await db.settlements.get(draft.id) : undefined;
      if (draft.id && (!existing || existing.tripId !== tripId)) throw new Error("missing");
      await db.settlements.put({
        id,
        tripId,
        fromMemberId: draft.fromMemberId,
        toMemberId: draft.toMemberId,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        date: draft.date,
        note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await touchTrip(tripId, now);
    });
  } catch {
    return { ok: false, error: "Could not save this payment." };
  }
  return { ok: true, id };
}

export async function deleteSettlement(tripId: string, settlementId: string): Promise<Result> {
  const settlement = await db.settlements.get(settlementId);
  if (!settlement || settlement.tripId !== tripId) {
    return { ok: false, error: "That payment is not on this trip." };
  }
  await db.transaction("rw", [db.settlements, db.trips], async () => {
    await db.settlements.delete(settlementId);
    await touchTrip(tripId, Date.now());
  });
  return { ok: true };
}

export async function importTripBackup(raw: string): Promise<ResultWithId> {
  const parsed = parseTripBackup(raw);
  if (!parsed.ok) return parsed;
  const now = Date.now();
  const ordered = sortMembers(parsed.backup.members);
  const stamped: TripBackup = {
    ...parsed.backup,
    members: ordered.map((member, index) => ({ ...member, createdAt: now + index + 1 })),
  };
  const backup = rekeyBackup(stamped, createId);
  const tripId = createId();
  try {
    await db.transaction("rw", [db.trips, db.members, db.rates, db.expenses, db.settlements], async () => {
      await db.trips.add({
        id: tripId,
        name: backup.trip.name,
        defaultCurrency: backup.trip.defaultCurrency,
        createdAt: now,
        updatedAt: now,
      });
      await db.members.bulkAdd(
        backup.members.map((member) => ({
          id: member.id,
          tripId,
          name: member.name,
          createdAt: member.createdAt,
        })),
      );
      if (backup.rates.length > 0) {
        await db.rates.bulkAdd(
          backup.rates.map((rate) => ({
            id: createId(),
            tripId,
            currency: rate.currency,
            rateScaled: rate.rateScaled,
            updatedAt: now,
          })),
        );
      }
      if (backup.expenses.length > 0) {
        await db.expenses.bulkAdd(backup.expenses.map((expense) => ({ ...expense, tripId })));
      }
      if (backup.settlements.length > 0) {
        await db.settlements.bulkAdd(backup.settlements.map((settlement) => ({ ...settlement, tripId })));
      }
    });
  } catch {
    return { ok: false, error: "Could not import this trip onto this device." };
  }
  return { ok: true, id: tripId };
}
