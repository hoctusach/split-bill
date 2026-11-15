# Split Bill

Split Bill is a local-first trip expense app. Trips, people, expenses, payments, and exchange rates stay in the browser. There is no account, no server, and no limit on how many expenses you add.

The interface is in English. Amounts use a dot or a comma as the decimal separator when you type (`12.50` or `12,50`). On screen they use `en-US` grouping.

## What you can do

- Create, rename, and delete a trip. Add and remove people by name. Each trip has one default currency, chosen when you create it.
- Add, edit, and delete an expense with a description, amount, currency, date, who paid, and a split: equal, exact amounts, percentages, or shares. The split has to add up before it can be saved.
- See each person's net balance in the trip currency, plus a shortened list of who should pay whom. Record a settlement when someone actually pays.
- Enter an expense in a different currency and type the exchange rate yourself. There is one manual rate per foreign currency per trip. Balances are converted into the trip currency. Changing a rate recalculates every expense and payment in that currency.
- Export a trip as CSV, or export and import a whole trip as JSON.

Data is stored in IndexedDB on this device. Install the page to use it offline.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173/split-bill/](http://localhost:5173/split-bill/). The `/split-bill/` prefix matches the GitHub Pages project URL.

```bash
npm test
npm run build
npm run preview
```

`npm run preview` serves the production build at [http://localhost:4173/split-bill/](http://localhost:4173/split-bill/).

## Deploy to GitHub Pages

`.github/workflows/pages.yml` runs the tests, builds the site, and deploys `dist/` when commits land on `main`. Pull requests are tested and are not deployed.

Before the first deploy:

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

After that, merging to `main` publishes [https://hoctusach.github.io/split-bill/](https://hoctusach.github.io/split-bill/). Routes live in the URL hash (`#/trip/...`). The build also copies `index.html` to `404.html`.

GitHub Pages on a public repository is free.

## Android later

This is a static single-page app: hash routing, no cookies, no backend. Capacitor is not set up. When you wrap it, build with a relative base so assets load inside the webview:

```bash
VITE_BASE=./ npm run build
```

The default `npm run build` stays pointed at GitHub Pages.

## Money

Amounts are integers in minor units. A currency's exponent comes from the built-in ISO 4217 list: USD and EUR use 2, JPY and VND use 0, KWD uses 3. Extra decimal places are rejected.

Equal, percentage, and share splits use the largest-remainder method. Shares always sum to the original amount. When two people are equally entitled to a leftover cent, the person who was added earlier gets it.

A foreign expense is converted once into the trip currency (half away from zero), then that converted total is split with the same weights. Converted shares sum to the converted total, so balances sum to zero.

An exchange rate means “1 unit of the foreign currency = this many units of the trip currency”, stored as a scaled integer with 8 decimal places.

Suggested payments match the largest remaining debt to the largest remaining credit. Ties break by person id.

## Data model

IndexedDB database name: `split-bill` (Dexie, schema version 1).

| Store | What it holds |
| --- | --- |
| `trips` | id, name, default currency, timestamps |
| `members` | id, trip id, name, created time (this order is the split order) |
| `rates` | trip id, currency, `rateScaled` string |
| `expenses` | description, minor units, currency, date, payer, split mode, parts |
| `settlements` | payer, receiver, amount, currency, date, note |

Expense `parts` store the input, not the rounded cents:

- `equal`: one entry per included person
- `exact`: minor units of the expense currency
- `percentage`: basis points, where `10000` is 100%
- `shares`: whole-number weights

JSON backups use `format: "split-bill"` and `version: 1`. Import creates a new trip with new ids. Only currencies in the built-in list are accepted.

CSV columns: `date`, `type`, `description`, `currency`, `amount`, `trip_currency`, `amount_in_trip_currency`, `paid_by`, `received_by`, `split`, `participants`. The file starts with a UTF-8 BOM.

## Project layout

- `src/lib/money.ts`, `split.ts`, `balance.ts`, `simplify.ts` — framework-free calculations, covered by Vitest
- `src/lib/export.ts` — JSON backup and CSV
- `src/db` — Dexie and the save/load functions
- `src/pages` — the screens

Sharing a read-only link, exporting a summary image, ads, and in-app purchase are not in this version.

## Icons

App icons live in `public/icons` and `public/favicon.svg`. Regenerate the PNGs with `npm run icons`.
