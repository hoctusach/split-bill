import { getCurrency, isKnownCurrency } from "./currency";
import { isIsoDate } from "./dates";
import { convertMinor, minorToDecimalString, RATE_SCALE } from "./money";
import type { SplitMode, SplitPart } from "./split";
import { computeSplit } from "./split";

export interface TripBackup {
  format: "split-bill";
  version: 1;
  exportedAt: string;
  trip: {
    name: string;
    defaultCurrency: string;
    createdAt: number;
    updatedAt: number;
  };
  members: { id: string; name: string; createdAt: number }[];
  rates: { currency: string; rateScaled: string; updatedAt: number }[];
  expenses: {
    id: string;
    description: string;
    amountMinor: number;
    currency: string;
    date: string;
    paidByMemberId: string;
    splitMode: SplitMode;
    parts: SplitPart[];
    createdAt: number;
    updatedAt: number;
  }[];
  settlements: {
    id: string;
    fromMemberId: string;
    toMemberId: string;
    amountMinor: number;
    currency: string;
    date: string;
    note: string;
    createdAt: number;
    updatedAt: number;
  }[];
}

export type BackupResult = { ok: true; backup: TripBackup } | { ok: false; error: string };

const SPLIT_MODES = new Set<SplitMode>(["equal", "exact", "percentage", "shares"]);
const MAX_MEMBERS = 100;
const MAX_EXPENSES = 5000;
const MAX_SETTLEMENTS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanName(value: string, max: number): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > max) return null;
  return trimmed;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 10_000_000_000_000;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

function knownCurrency(value: unknown): value is string {
  return typeof value === "string" && isKnownCurrency(value);
}

export function serializeBackup(backup: TripBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function parseTripBackup(raw: string): BackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isRecord(parsed)) return { ok: false, error: "That file is not a Split Bill backup." };
  if (parsed.format !== "split-bill" || parsed.version !== 1) {
    return { ok: false, error: "This file is not a version 1 Split Bill backup." };
  }
  if (!isRecord(parsed.trip)) return { ok: false, error: "The backup is missing the trip." };
  const name = typeof parsed.trip.name === "string" ? cleanName(parsed.trip.name, 60) : null;
  if (!name) return { ok: false, error: "The trip name is missing." };
  const defaultCurrency = parsed.trip.defaultCurrency;
  if (!knownCurrency(defaultCurrency)) {
    return { ok: false, error: "The trip currency is not supported." };
  }
  if (!isTimestamp(parsed.trip.createdAt) || !isTimestamp(parsed.trip.updatedAt)) {
    return { ok: false, error: "The trip timestamps are invalid." };
  }
  if (!Array.isArray(parsed.members) || parsed.members.length < 1 || parsed.members.length > MAX_MEMBERS) {
    return { ok: false, error: "The backup needs between 1 and 100 people." };
  }
  if (!Array.isArray(parsed.expenses) || parsed.expenses.length > MAX_EXPENSES) {
    return { ok: false, error: "The backup has too many expenses." };
  }
  if (!Array.isArray(parsed.settlements) || parsed.settlements.length > MAX_SETTLEMENTS) {
    return { ok: false, error: "The backup has too many payments." };
  }
  if (!Array.isArray(parsed.rates)) return { ok: false, error: "The backup is missing exchange rates." };

  const members: TripBackup["members"] = [];
  const memberIds = new Set<string>();
  for (const entry of parsed.members) {
    if (!isRecord(entry) || !isId(entry.id) || typeof entry.name !== "string" || !isTimestamp(entry.createdAt)) {
      return { ok: false, error: "A person in the backup is incomplete." };
    }
    const memberName = cleanName(entry.name, 40);
    if (!memberName) return { ok: false, error: "A person in the backup has an invalid name." };
    if (memberIds.has(entry.id)) return { ok: false, error: "The backup repeats a person." };
    memberIds.add(entry.id);
    members.push({ id: entry.id, name: memberName, createdAt: entry.createdAt });
  }

  const rates: TripBackup["rates"] = [];
  const rateCurrencies = new Set<string>();
  for (const entry of parsed.rates) {
    if (!isRecord(entry) || !knownCurrency(entry.currency) || typeof entry.rateScaled !== "string") {
      return { ok: false, error: "An exchange rate in the backup is invalid." };
    }
    const currency = entry.currency;
    if (!/^[1-9]\d{0,17}$/.test(entry.rateScaled)) {
      return { ok: false, error: `The ${currency} exchange rate is invalid.` };
    }
    if (currency === defaultCurrency) {
      return { ok: false, error: "The trip currency does not need an exchange rate." };
    }
    if (rateCurrencies.has(currency)) {
      return { ok: false, error: `The backup has two rates for ${currency}.` };
    }
    rateCurrencies.add(currency);
    rates.push({
      currency,
      rateScaled: entry.rateScaled,
      updatedAt: isTimestamp(entry.updatedAt) ? entry.updatedAt : parsed.trip.updatedAt,
    });
  }

  const expenses: TripBackup["expenses"] = [];
  const expenseIds = new Set<string>();
  for (const entry of parsed.expenses) {
    if (!isRecord(entry)) return { ok: false, error: "An expense in the backup is incomplete." };
    const description = typeof entry.description === "string" ? cleanName(entry.description, 120) : null;
    if (
      !isId(entry.id) ||
      !description ||
      typeof entry.amountMinor !== "number" ||
      !Number.isSafeInteger(entry.amountMinor) ||
      entry.amountMinor <= 0 ||
      !knownCurrency(entry.currency) ||
      typeof entry.date !== "string" ||
      !isIsoDate(entry.date) ||
      typeof entry.paidByMemberId !== "string" ||
      typeof entry.splitMode !== "string" ||
      !SPLIT_MODES.has(entry.splitMode as SplitMode) ||
      !Array.isArray(entry.parts) ||
      !isTimestamp(entry.createdAt) ||
      !isTimestamp(entry.updatedAt)
    ) {
      return { ok: false, error: `The expense "${description ?? "unknown"}" is incomplete.` };
    }
    if (!memberIds.has(entry.paidByMemberId)) {
      return { ok: false, error: `"${description}" is paid by someone who is not on the trip.` };
    }
    if (expenseIds.has(entry.id)) return { ok: false, error: "The backup repeats an expense." };
    expenseIds.add(entry.id);
    const parts: SplitPart[] = [];
    for (const part of entry.parts) {
      if (
        !isRecord(part) ||
        typeof part.memberId !== "string" ||
        typeof part.value !== "number" ||
        !Number.isSafeInteger(part.value)
      ) {
        return { ok: false, error: `"${description}" has an invalid split.` };
      }
      if (!memberIds.has(part.memberId)) {
        return { ok: false, error: `"${description}" includes someone who is not on the trip.` };
      }
      parts.push({ memberId: part.memberId, value: part.value });
    }
    const splitMode = entry.splitMode as SplitMode;
    const split = computeSplit({
      amountMinor: entry.amountMinor,
      mode: splitMode,
      parts,
    });
    if (!split.ok) return { ok: false, error: `"${description}" ${split.error}` };
    expenses.push({
      id: entry.id,
      description,
      amountMinor: entry.amountMinor,
      currency: entry.currency,
      date: entry.date,
      paidByMemberId: entry.paidByMemberId,
      splitMode,
      parts,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  const settlements: TripBackup["settlements"] = [];
  const settlementIds = new Set<string>();
  for (const entry of parsed.settlements) {
    if (!isRecord(entry)) return { ok: false, error: "A payment in the backup is incomplete." };
    const note = typeof entry.note === "string" ? entry.note.trim().replace(/\s+/g, " ") : "";
    if (
      !isId(entry.id) ||
      typeof entry.fromMemberId !== "string" ||
      typeof entry.toMemberId !== "string" ||
      typeof entry.amountMinor !== "number" ||
      !Number.isSafeInteger(entry.amountMinor) ||
      entry.amountMinor <= 0 ||
      !knownCurrency(entry.currency) ||
      typeof entry.date !== "string" ||
      !isIsoDate(entry.date) ||
      note.length > 200 ||
      !isTimestamp(entry.createdAt) ||
      !isTimestamp(entry.updatedAt)
    ) {
      return { ok: false, error: "A payment in the backup is incomplete." };
    }
    if (!memberIds.has(entry.fromMemberId) || !memberIds.has(entry.toMemberId)) {
      return { ok: false, error: "A payment refers to someone who is not on the trip." };
    }
    if (entry.fromMemberId === entry.toMemberId) {
      return { ok: false, error: "A payment cannot be from a person to themselves." };
    }
    if (settlementIds.has(entry.id)) return { ok: false, error: "The backup repeats a payment." };
    settlementIds.add(entry.id);
    settlements.push({
      id: entry.id,
      fromMemberId: entry.fromMemberId,
      toMemberId: entry.toMemberId,
      amountMinor: entry.amountMinor,
      currency: entry.currency,
      date: entry.date,
      note,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  return {
    ok: true,
    backup: {
      format: "split-bill",
      version: 1,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date(0).toISOString(),
      trip: {
        name,
        defaultCurrency,
        createdAt: parsed.trip.createdAt,
        updatedAt: parsed.trip.updatedAt,
      },
      members,
      rates,
      expenses,
      settlements,
    },
  };
}

export function rekeyBackup(backup: TripBackup, newId: () => string, now = Date.now()): TripBackup {
  const memberIds = new Map(backup.members.map((member) => [member.id, newId()]));
  const mapMember = (id: string) => {
    const next = memberIds.get(id);
    if (!next) throw new Error(`Unknown member ${id}`);
    return next;
  };
  return {
    ...backup,
    exportedAt: new Date(now).toISOString(),
    members: backup.members.map((member) => ({ ...member, id: mapMember(member.id) })),
    expenses: backup.expenses.map((expense) => ({
      ...expense,
      id: newId(),
      paidByMemberId: mapMember(expense.paidByMemberId),
      parts: expense.parts.map((part) => ({ ...part, memberId: mapMember(part.memberId) })),
    })),
    settlements: backup.settlements.map((settlement) => ({
      ...settlement,
      id: newId(),
      fromMemberId: mapMember(settlement.fromMemberId),
      toMemberId: mapMember(settlement.toMemberId),
    })),
  };
}

function csvText(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

function csvNumber(minor: number, exponent: number): string {
  return minorToDecimalString(minor, exponent);
}

export function buildTripCsv(backup: TripBackup): string {
  const names = new Map(backup.members.map((member) => [member.id, member.name]));
  const rates = new Map(backup.rates.map((rate) => [rate.currency, BigInt(rate.rateScaled)]));
  const defaultExponent = getCurrency(backup.trip.defaultCurrency).exponent;
  const header = [
    "date",
    "type",
    "description",
    "currency",
    "amount",
    "trip_currency",
    "amount_in_trip_currency",
    "paid_by",
    "received_by",
    "split",
    "participants",
  ];
  const lines = [header.join(",")];

  const push = (cells: string[]) => {
    lines.push(cells.map(csvText).join(","));
  };

  for (const expense of backup.expenses) {
    const exponent = getCurrency(expense.currency).exponent;
    const split = computeSplit({
      amountMinor: expense.amountMinor,
      mode: expense.splitMode,
      parts: expense.parts,
    });
    const participants = split.ok
      ? split.shares
          .map((share) => `${names.get(share.memberId) ?? share.memberId}: ${csvNumber(share.amountMinor, exponent)}`)
          .join("; ")
      : "";
    const rate = expense.currency === backup.trip.defaultCurrency ? RATE_SCALE : rates.get(expense.currency);
    const converted =
      split.ok && rate !== undefined
        ? csvNumber(
            convertMinor({
              amountMinor: expense.amountMinor,
              fromExponent: exponent,
              toExponent: defaultExponent,
              rateScaled: rate,
            }),
            defaultExponent,
          )
        : "";
    push([
      expense.date,
      "expense",
      expense.description,
      expense.currency,
      csvNumber(expense.amountMinor, exponent),
      backup.trip.defaultCurrency,
      converted,
      names.get(expense.paidByMemberId) ?? expense.paidByMemberId,
      "",
      expense.splitMode,
      participants,
    ]);
  }

  for (const settlement of backup.settlements) {
    const exponent = getCurrency(settlement.currency).exponent;
    const rate =
      settlement.currency === backup.trip.defaultCurrency ? RATE_SCALE : rates.get(settlement.currency);
    const converted =
      rate === undefined
        ? ""
        : csvNumber(
            convertMinor({
              amountMinor: settlement.amountMinor,
              fromExponent: exponent,
              toExponent: defaultExponent,
              rateScaled: rate,
            }),
            defaultExponent,
          );
    push([
      settlement.date,
      "settlement",
      settlement.note,
      settlement.currency,
      csvNumber(settlement.amountMinor, exponent),
      backup.trip.defaultCurrency,
      converted,
      names.get(settlement.fromMemberId) ?? settlement.fromMemberId,
      names.get(settlement.toMemberId) ?? settlement.toMemberId,
      "",
      "",
    ]);
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60) || "trip";
}
