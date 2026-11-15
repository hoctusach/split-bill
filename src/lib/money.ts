/**
 * Money is stored as integer minor units (cents, fils, …).
 * Exchange rates are major-to-major ratios scaled by RATE_SCALE (1e8),
 * so 1 unit of a foreign currency equals `rateScaled / 1e8` units of the
 * trip currency. Rounding is half away from zero, once per conversion.
 */

export const RATE_SCALE = 100_000_000n;

export function minorScale(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 8) {
    throw new Error("Currency exponent must be an integer from 0 to 8");
  }
  return 10n ** BigInt(exponent);
}

/** Integer division that rounds halves away from zero. */
export function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error("Cannot divide by zero");
  }
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function convertMinor(input: {
  amountMinor: number;
  fromExponent: number;
  toExponent: number;
  /** 1 major unit of `from` currency = rateScaled/RATE_SCALE major units of `to`. */
  rateScaled: bigint;
}): number {
  if (!Number.isSafeInteger(input.amountMinor)) {
    throw new Error("Amount must be a safe integer");
  }
  if (input.rateScaled <= 0n) {
    throw new Error("Exchange rate must be positive");
  }
  const numerator =
    BigInt(input.amountMinor) * input.rateScaled * minorScale(input.toExponent);
  const denominator = minorScale(input.fromExponent) * RATE_SCALE;
  const result = divideRoundHalfAwayFromZero(numerator, denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error("Converted amount exceeds the safe integer range");
  }
  return Number(result);
}

/**
 * Parse a decimal typed by a person into minor units.
 * Accepts either "." or "," as the decimal separator, not both.
 * Rejects more fractional digits than the currency allows, so input never rounds.
 */
export function parseDecimalToMinor(input: string, exponent: number): number | null {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 8) return null;
  const trimmed = input.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  if (trimmed.includes(",") && trimmed.includes(".")) return null;
  const normalized = trimmed.replace(",", ".");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (fraction.length > exponent) return null;
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const frac = BigInt(fraction.padEnd(exponent, "0") || "0");
  const minor = sign * (whole * minorScale(exponent) + frac);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(-Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(minor);
}

/** Inverse of parseDecimalToMinor. Trailing zeros in the fraction are omitted. */
export function minorToDecimalString(minor: number, exponent: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Amount must be a safe integer");
  }
  const negative = minor < 0;
  const absolute = BigInt(Math.abs(minor));
  const scale = minorScale(exponent);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  let body = whole.toString();
  if (exponent > 0) {
    const fractionText = fraction.toString().padStart(exponent, "0").replace(/0+$/, "");
    if (fractionText) body += `.${fractionText}`;
  }
  return negative ? `-${body}` : body;
}

/** Positive major-to-major rate with at most 8 decimal places, returned scaled by RATE_SCALE. */
export function parseRateToScaled(input: string): bigint | null {
  const minor = parseDecimalToMinor(input, 8);
  if (minor === null || minor <= 0) return null;
  return BigInt(minor);
}

export function rateScaledToInput(rateScaled: bigint): string {
  if (rateScaled <= 0n || rateScaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Exchange rate is out of range");
  }
  return minorToDecimalString(Number(rateScaled), 8);
}

export function formatMoney(
  minor: number,
  currency: string,
  exponent: number,
  locale = "en-US",
): string {
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Amount must be a safe integer");
  }
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const scale = 10 ** exponent;
  if (!Number.isSafeInteger(scale)) {
    throw new Error("Currency exponent is too large to format");
  }
  const whole = Math.floor(absolute / scale);
  const fraction = absolute % scale;
  try {
    const template = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).formatToParts(negative ? -1 : 1);
    const groupedWhole = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(whole);
    let replacedInteger = false;
    return template
      .map((part) => {
        if (part.type === "integer") {
          if (replacedInteger) return "";
          replacedInteger = true;
          return groupedWhole;
        }
        if (part.type === "group") return "";
        if (part.type === "fraction") {
          return exponent > 0 ? String(fraction).padStart(exponent, "0") : "";
        }
        return part.value;
      })
      .join("");
  } catch {
    const number = minorToDecimalString(minor, exponent);
    return `${number} ${currency}`;
  }
}
