import { describe, expect, it } from "vitest";
import { getCurrency, suggestedCurrency } from "./currency";

describe("currencies", () => {
  it("uses ISO minor-unit exponents, including zero and three decimal currencies", () => {
    expect(getCurrency("USD").exponent).toBe(2);
    expect(getCurrency("JPY").exponent).toBe(0);
    expect(getCurrency("VND").exponent).toBe(0);
    expect(getCurrency("KWD").exponent).toBe(3);
    expect(getCurrency("EUR").name).toBe("Euro");
  });

  it("suggests a currency from the locale and falls back to USD", () => {
    expect(suggestedCurrency("en-US")).toBe("USD");
    expect(suggestedCurrency("en-GB")).toBe("GBP");
    expect(suggestedCurrency("ja-JP")).toBe("JPY");
    expect(suggestedCurrency("pt-PT")).toBe("EUR");
    expect(suggestedCurrency("de-DE")).toBe("EUR");
    expect(suggestedCurrency("en")).toBe("USD");
  });
});
