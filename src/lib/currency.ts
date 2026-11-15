export interface CurrencyInfo {
  code: string;
  name: string;
  exponent: number;
}

/** ISO 4217 codes used by the picker. Unknown codes fall back to 2 decimal places. */
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "USD", name: "US Dollar", exponent: 2 },
  { code: "EUR", name: "Euro", exponent: 2 },
  { code: "GBP", name: "British Pound", exponent: 2 },
  { code: "JPY", name: "Japanese Yen", exponent: 0 },
  { code: "CHF", name: "Swiss Franc", exponent: 2 },
  { code: "CAD", name: "Canadian Dollar", exponent: 2 },
  { code: "AUD", name: "Australian Dollar", exponent: 2 },
  { code: "NZD", name: "New Zealand Dollar", exponent: 2 },
  { code: "CNY", name: "Chinese Yuan", exponent: 2 },
  { code: "HKD", name: "Hong Kong Dollar", exponent: 2 },
  { code: "SGD", name: "Singapore Dollar", exponent: 2 },
  { code: "KRW", name: "South Korean Won", exponent: 0 },
  { code: "INR", name: "Indian Rupee", exponent: 2 },
  { code: "VND", name: "Vietnamese Dong", exponent: 0 },
  { code: "THB", name: "Thai Baht", exponent: 2 },
  { code: "MYR", name: "Malaysian Ringgit", exponent: 2 },
  { code: "IDR", name: "Indonesian Rupiah", exponent: 2 },
  { code: "PHP", name: "Philippine Peso", exponent: 2 },
  { code: "TWD", name: "New Taiwan Dollar", exponent: 2 },
  { code: "AED", name: "UAE Dirham", exponent: 2 },
  { code: "SAR", name: "Saudi Riyal", exponent: 2 },
  { code: "QAR", name: "Qatari Riyal", exponent: 2 },
  { code: "KWD", name: "Kuwaiti Dinar", exponent: 3 },
  { code: "BHD", name: "Bahraini Dinar", exponent: 3 },
  { code: "OMR", name: "Omani Rial", exponent: 3 },
  { code: "JOD", name: "Jordanian Dinar", exponent: 3 },
  { code: "ILS", name: "Israeli Shekel", exponent: 2 },
  { code: "TRY", name: "Turkish Lira", exponent: 2 },
  { code: "ZAR", name: "South African Rand", exponent: 2 },
  { code: "SEK", name: "Swedish Krona", exponent: 2 },
  { code: "NOK", name: "Norwegian Krone", exponent: 2 },
  { code: "DKK", name: "Danish Krone", exponent: 2 },
  { code: "ISK", name: "Icelandic Krona", exponent: 0 },
  { code: "PLN", name: "Polish Zloty", exponent: 2 },
  { code: "CZK", name: "Czech Koruna", exponent: 2 },
  { code: "HUF", name: "Hungarian Forint", exponent: 2 },
  { code: "RON", name: "Romanian Leu", exponent: 2 },
  { code: "BGN", name: "Bulgarian Lev", exponent: 2 },
  { code: "RSD", name: "Serbian Dinar", exponent: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", exponent: 2 },
  { code: "MXN", name: "Mexican Peso", exponent: 2 },
  { code: "BRL", name: "Brazilian Real", exponent: 2 },
  { code: "ARS", name: "Argentine Peso", exponent: 2 },
  { code: "CLP", name: "Chilean Peso", exponent: 0 },
  { code: "COP", name: "Colombian Peso", exponent: 2 },
  { code: "PEN", name: "Peruvian Sol", exponent: 2 },
  { code: "EGP", name: "Egyptian Pound", exponent: 2 },
  { code: "MAD", name: "Moroccan Dirham", exponent: 2 },
  { code: "NGN", name: "Nigerian Naira", exponent: 2 },
  { code: "KES", name: "Kenyan Shilling", exponent: 2 },
  { code: "GHS", name: "Ghanaian Cedi", exponent: 2 },
  { code: "XOF", name: "West African CFA Franc", exponent: 0 },
  { code: "XAF", name: "Central African CFA Franc", exponent: 0 },
  { code: "LKR", name: "Sri Lankan Rupee", exponent: 2 },
  { code: "PKR", name: "Pakistani Rupee", exponent: 2 },
  { code: "BDT", name: "Bangladeshi Taka", exponent: 2 },
  { code: "NPR", name: "Nepalese Rupee", exponent: 2 },
];

const BY_CODE = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export function isKnownCurrency(value: string): boolean {
  return BY_CODE.has(value);
}

export function getCurrency(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, exponent: 2 };
}

const EURO_REGIONS = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
]);

/** A starting currency from the browser locale. People can still pick any currency. */
export function suggestedCurrency(locale: string): string {
  const region = locale.match(/-([A-Za-z]{2})\b/)?.[1]?.toUpperCase();
  if (region === "US") return "USD";
  if (region === "GB") return "GBP";
  if (region === "JP") return "JPY";
  if (region && EURO_REGIONS.has(region)) return "EUR";
  return "USD";
}

/** USD, EUR, and GBP first, then the rest alphabetically. */
export function currencyChoices(): CurrencyInfo[] {
  const pinned = ["USD", "EUR", "GBP"];
  const head = pinned
    .map((code) => BY_CODE.get(code))
    .filter((currency): currency is CurrencyInfo => Boolean(currency));
  const tail = CURRENCIES.filter((currency) => !pinned.includes(currency.code))
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  return [...head, ...tail];
}
