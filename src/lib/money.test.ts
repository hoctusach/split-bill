import { describe, expect, it } from "vitest";
import {
  RATE_SCALE,
  convertMinor,
  divideRoundHalfAwayFromZero,
  formatMoney,
  minorToDecimalString,
  parseDecimalToMinor,
  parseRateToScaled,
  rateScaledToInput,
} from "./money";

describe("divideRoundHalfAwayFromZero", () => {
  it("rounds halves away from zero and truncates smaller remainders", () => {
    expect(divideRoundHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(divideRoundHalfAwayFromZero(-5n, 2n)).toBe(-3n);
    expect(divideRoundHalfAwayFromZero(5n, -2n)).toBe(-3n);
    expect(divideRoundHalfAwayFromZero(1n, 2n)).toBe(1n);
    expect(divideRoundHalfAwayFromZero(-1n, 2n)).toBe(-1n);
    expect(divideRoundHalfAwayFromZero(1n, 3n)).toBe(0n);
    expect(divideRoundHalfAwayFromZero(2n, 3n)).toBe(1n);
    expect(divideRoundHalfAwayFromZero(-2n, 3n)).toBe(-1n);
  });
});

describe("parseDecimalToMinor", () => {
  it("parses dot and comma decimals without rounding extra digits", () => {
    expect(parseDecimalToMinor("10", 2)).toBe(1000);
    expect(parseDecimalToMinor("10.5", 2)).toBe(1050);
    expect(parseDecimalToMinor("10.50", 2)).toBe(1050);
    expect(parseDecimalToMinor("1,5", 2)).toBe(150);
    expect(parseDecimalToMinor("0.01", 2)).toBe(1);
    expect(parseDecimalToMinor("1.", 2)).toBe(100);
    expect(parseDecimalToMinor("-2.50", 2)).toBe(-250);
    expect(parseDecimalToMinor("10.501", 2)).toBeNull();
    expect(parseDecimalToMinor("1.234,56", 2)).toBeNull();
    expect(parseDecimalToMinor("", 2)).toBeNull();
    expect(parseDecimalToMinor("abc", 2)).toBeNull();
    expect(parseDecimalToMinor("1e2", 2)).toBeNull();
    expect(parseDecimalToMinor("1500", 0)).toBe(1500);
    expect(parseDecimalToMinor("15.0", 0)).toBeNull();
  });

  it("round-trips through minorToDecimalString", () => {
    for (const amount of [0, 1, 10, 100, 1050, 3334, -50, 10_000_000]) {
      expect(parseDecimalToMinor(minorToDecimalString(amount, 2), 2)).toBe(amount);
    }
    expect(minorToDecimalString(1050, 2)).toBe("10.5");
    expect(minorToDecimalString(1000, 2)).toBe("10");
    expect(minorToDecimalString(-250, 2)).toBe("-2.5");
  });
});

describe("exchange rates", () => {
  it("stores a major-to-major rate at 8 decimal places", () => {
    expect(parseRateToScaled("0.92")).toBe(92_000_000n);
    expect(parseRateToScaled("1")).toBe(RATE_SCALE);
    expect(parseRateToScaled("0.0067")).toBe(670_000n);
    expect(parseRateToScaled("0.00000001")).toBe(1n);
    expect(parseRateToScaled("0")).toBeNull();
    expect(parseRateToScaled("-1")).toBeNull();
    expect(parseRateToScaled("0.000000001")).toBeNull();
    expect(rateScaledToInput(92_000_000n)).toBe("0.92");
  });
});

describe("convertMinor", () => {
  it("is an identity conversion at rate 1, including a 1-cent amount", () => {
    for (const amount of [1, 2, 99, 100, 101, 10_000]) {
      expect(
        convertMinor({
          amountMinor: amount,
          fromExponent: 2,
          toExponent: 2,
          rateScaled: RATE_SCALE,
        }),
      ).toBe(amount);
    }
  });

  it("converts JPY to USD with a manual rate and rounds half away from zero", () => {
    const rate = parseRateToScaled("0.0067");
    expect(rate).not.toBeNull();
    expect(
      convertMinor({
        amountMinor: 100,
        fromExponent: 0,
        toExponent: 2,
        rateScaled: rate!,
      }),
    ).toBe(67);
    expect(
      convertMinor({
        amountMinor: 1,
        fromExponent: 0,
        toExponent: 2,
        rateScaled: rate!,
      }),
    ).toBe(1);
    expect(
      convertMinor({
        amountMinor: 3,
        fromExponent: 0,
        toExponent: 2,
        rateScaled: rate!,
      }),
    ).toBe(2);
  });

  it("converts 3-decimal dinars and rounds a half cent away from zero", () => {
    expect(
      convertMinor({
        amountMinor: 1500,
        fromExponent: 3,
        toExponent: 2,
        rateScaled: parseRateToScaled("3.26")!,
      }),
    ).toBe(489);

    expect(
      convertMinor({
        amountMinor: 1,
        fromExponent: 3,
        toExponent: 2,
        rateScaled: RATE_SCALE,
      }),
    ).toBe(0);
    expect(
      convertMinor({
        amountMinor: 4,
        fromExponent: 3,
        toExponent: 2,
        rateScaled: RATE_SCALE,
      }),
    ).toBe(0);
    expect(
      convertMinor({
        amountMinor: 5,
        fromExponent: 3,
        toExponent: 2,
        rateScaled: RATE_SCALE,
      }),
    ).toBe(1);
    expect(
      convertMinor({
        amountMinor: -5,
        fromExponent: 3,
        toExponent: 2,
        rateScaled: RATE_SCALE,
      }),
    ).toBe(-1);
  });
});

describe("formatMoney", () => {
  it("formats from integer minor units in en-US", () => {
    expect(formatMoney(12345, "USD", 2)).toBe("$123.45");
    expect(formatMoney(-50, "USD", 2)).toBe("-$0.50");
    expect(formatMoney(123456, "USD", 2)).toBe("$1,234.56");
    expect(formatMoney(1500, "JPY", 0)).toBe("¥1,500");
    expect(formatMoney(1, "USD", 2)).toBe("$0.01");
    expect(formatMoney(100, "EUR", 2)).toBe("€1.00");
    expect(formatMoney(1500, "KWD", 3).replaceAll("\u00a0", " ")).toBe("KWD 1.500");
  });
});
