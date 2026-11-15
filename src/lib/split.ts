/**
 * Split an integer amount across people so the shares sum to the amount exactly.
 * Extra minor units use the largest-remainder method.
 * When fractional remainders tie, the earlier entry in `parts` receives the cent.
 * The app passes people in the order they were added, so that order stays stable
 * when someone is renamed.
 */

export type SplitMode = "equal" | "exact" | "percentage" | "shares";

export interface WeightedPart {
  memberId: string;
  weight: number;
}

export interface AllocatedShare {
  memberId: string;
  amountMinor: number;
}

export interface SplitPart {
  memberId: string;
  /**
   * equal: ignored (presence means included).
   * exact: minor units of the expense currency.
   * percentage: basis points, where 10000 is 100%.
   * shares: whole-number shares.
   */
  value: number;
}

export type SplitResult =
  | { ok: true; shares: AllocatedShare[] }
  | { ok: false; error: string };

export function allocateByWeights(
  amountMinor: number,
  parts: readonly WeightedPart[],
): AllocatedShare[] {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("Amount must be a safe integer");
  }
  if (parts.length === 0) {
    throw new Error("At least one part is required");
  }

  const seen = new Set<string>();
  let totalWeight = 0;
  for (const part of parts) {
    if (!part.memberId) throw new Error("A split part is missing a person");
    if (seen.has(part.memberId)) throw new Error("Duplicate member in split");
    seen.add(part.memberId);
    if (!Number.isSafeInteger(part.weight) || part.weight < 0) {
      throw new Error("Weights must be non-negative integers");
    }
    totalWeight += part.weight;
  }
  if (totalWeight <= 0) throw new Error("Total weight must be positive");
  if (!Number.isSafeInteger(totalWeight)) throw new Error("Total weight is too large");

  const sign = amountMinor < 0 ? -1 : 1;
  const amount = BigInt(Math.abs(amountMinor));
  const total = BigInt(totalWeight);

  const rows = parts.map((part, index) => {
    const product = amount * BigInt(part.weight);
    return {
      memberId: part.memberId,
      weight: part.weight,
      index,
      base: product / total,
      remainder: product % total,
    };
  });

  let leftover = amount;
  for (const row of rows) leftover -= row.base;
  if (leftover < 0n || leftover >= BigInt(parts.length)) {
    throw new Error("Failed to allocate remainder");
  }

  const ranked = rows
    .filter((row) => row.weight > 0)
    .slice()
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      return a.index - b.index;
    });

  const extra = new Set<string>();
  for (const row of ranked) {
    if (leftover === 0n) break;
    extra.add(row.memberId);
    leftover -= 1n;
  }
  if (leftover !== 0n) throw new Error("Failed to allocate remainder");

  return rows.map((row) => {
    const share = row.base + (extra.has(row.memberId) ? 1n : 0n);
    const signed = sign < 0 ? -share : share;
    if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(-Number.MAX_SAFE_INTEGER)) {
      throw new Error("Share exceeds the safe integer range");
    }
    return { memberId: row.memberId, amountMinor: Number(signed) };
  });
}

function duplicateMember(parts: readonly SplitPart[]): boolean {
  const seen = new Set<string>();
  for (const part of parts) {
    if (seen.has(part.memberId)) return true;
    seen.add(part.memberId);
  }
  return false;
}

export function computeSplit(input: {
  amountMinor: number;
  mode: SplitMode;
  parts: readonly SplitPart[];
}): SplitResult {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (input.parts.length === 0) {
    return { ok: false, error: "Choose at least one person to include in the split." };
  }
  if (duplicateMember(input.parts)) {
    return { ok: false, error: "Each person can only appear once in a split." };
  }

  try {
    if (input.mode === "equal") {
      return {
        ok: true,
        shares: allocateByWeights(
          input.amountMinor,
          input.parts.map((part) => ({ memberId: part.memberId, weight: 1 })),
        ),
      };
    }

    if (input.mode === "exact") {
      let sum = 0;
      for (const part of input.parts) {
        if (!Number.isSafeInteger(part.value) || part.value < 0) {
          return { ok: false, error: "Exact amounts must be zero or more." };
        }
        sum += part.value;
      }
      if (!Number.isSafeInteger(sum)) {
        return { ok: false, error: "These amounts are too large." };
      }
      if (sum !== input.amountMinor) {
        return { ok: false, error: "Exact amounts must add up to the expense total." };
      }
      return {
        ok: true,
        shares: input.parts.map((part) => ({ memberId: part.memberId, amountMinor: part.value })),
      };
    }

    if (input.mode === "percentage") {
      let sum = 0;
      for (const part of input.parts) {
        if (!Number.isSafeInteger(part.value) || part.value < 0 || part.value > 10_000) {
          return { ok: false, error: "Each percentage must be between 0 and 100." };
        }
        sum += part.value;
      }
      if (sum !== 10_000) {
        return { ok: false, error: "Percentages must add up to 100%." };
      }
      const weighted = input.parts.filter((part) => part.value > 0);
      return {
        ok: true,
        shares: allocateByWeights(
          input.amountMinor,
          weighted.map((part) => ({ memberId: part.memberId, weight: part.value })),
        ),
      };
    }

    if (input.mode === "shares") {
      for (const part of input.parts) {
        if (!Number.isSafeInteger(part.value) || part.value < 0) {
          return { ok: false, error: "Shares must be whole numbers, zero or more." };
        }
      }
      const weighted = input.parts.filter((part) => part.value > 0);
      if (weighted.length === 0) {
        return { ok: false, error: "Enter at least one share." };
      }
      return {
        ok: true,
        shares: allocateByWeights(
          input.amountMinor,
          weighted.map((part) => ({ memberId: part.memberId, weight: part.value })),
        ),
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not split this expense.",
    };
  }

  return { ok: false, error: "Unknown split type." };
}

/** Basis points that sum to exactly 10000, leftover points going to earlier members. */
export function equalBasisPoints(memberIds: readonly string[]): SplitPart[] {
  if (memberIds.length === 0) return [];
  return allocateByWeights(
    10_000,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  ).map((share) => ({ memberId: share.memberId, value: share.amountMinor }));
}
