import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loading, MissingTrip, PageBody, TopBar, usePageTitle } from "../components/Screen";
import { Button, ConfirmDialog, Dialog, Field, Notice, controlClass, cx } from "../components/ui";
import {
  addMember,
  deleteTrip,
  removeMember,
  renameMember,
  renameTrip,
  saveRate,
  tripToBackup,
} from "../db/repository";
import { useTripBundle } from "../db/useTripData";
import type { MemberRecord, TripBundle } from "../domain/types";
import { foreignCurrencies, projectTrip, toDefaultMinor } from "../domain/projectTrip";
import { formatDisplayDate } from "../lib/dates";
import { downloadText } from "../lib/download";
import { buildTripCsv, serializeBackup, slugify } from "../lib/export";
import { getCurrency } from "../lib/currency";
import { sortMembers } from "../lib/members";
import { formatMoney, rateScaledToInput } from "../lib/money";
import type { SplitMode } from "../lib/split";

const TABS = [
  { id: "balances", label: "Balances" },
  { id: "expenses", label: "Expenses" },
  { id: "trip", label: "Trip" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromParam(value: string | null): TabId {
  if (value === "expenses" || value === "trip") return value;
  return "balances";
}

function splitLabel(mode: SplitMode): string {
  if (mode === "equal") return "split equally";
  if (mode === "exact") return "exact amounts";
  if (mode === "percentage") return "by percentage";
  return "by shares";
}

export function TripPage() {
  const { tripId = "" } = useParams();
  const bundle = useTripBundle(tripId);
  const [params, setParams] = useSearchParams();
  const tab = tabFromParam(params.get("tab"));
  usePageTitle(bundle?.trip.name ?? "Trip");

  if (bundle === undefined) return <Loading />;
  if (bundle === null) return <MissingTrip />;

  return (
    <div>
      <TopBar title={bundle.trip.name} backTo="/" />
      <div role="tablist" aria-label="Trip sections" className="grid grid-cols-3 border-b border-line bg-paper">
        {TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cx(
                "min-h-11 text-sm font-semibold",
                selected ? "border-b-2 border-teal text-teal" : "text-muted",
              )}
              onClick={() => {
                setParams(item.id === "balances" ? {} : { tab: item.id }, { replace: true });
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {tab === "balances" ? <BalancesTab bundle={bundle} /> : null}
      {tab === "expenses" ? <ExpensesTab bundle={bundle} /> : null}
      {tab === "trip" ? <TripTab bundle={bundle} onOpenBalances={() => setParams({}, { replace: true })} /> : null}
    </div>
  );
}

function BalancesTab({ bundle }: { bundle: TripBundle }) {
  const navigate = useNavigate();
  const projection = useMemo(() => projectTrip(bundle), [bundle]);
  const currency = bundle.trip.defaultCurrency;
  const exponent = getCurrency(currency).exponent;
  const names = new Map(projection.members.map((member) => [member.id, member.name]));
  const nameOf = (id: string) => names.get(id) ?? "Someone";

  return (
    <PageBody className="space-y-5 pb-8">
      <p className="text-sm text-muted">
        {currency} · {projection.members.length} {projection.members.length === 1 ? "person" : "people"}
        {projection.balance.ok
          ? ` · spent ${formatMoney(projection.balance.totalSpentMinor, currency, exponent)}`
          : ""}
      </p>

      {projection.problem ? <Notice tone="bad">{projection.problem}</Notice> : null}
      {!projection.balance.ok && projection.balance.missingCurrencies.length > 0 ? (
        <Notice>
          Add an exchange rate for {projection.balance.missingCurrencies.join(", ")} on the Trip tab. Balances stay
          blank until every currency can be converted to {currency}.
        </Notice>
      ) : null}

      {projection.expenses.length === 0 && projection.settlements.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-5 py-8">
          <h2 className="font-display text-2xl">No expenses yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Add the first bill and this page will show who owes whom.</p>
          <Link
            to={`/trip/${bundle.trip.id}/expense/new`}
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-teal px-4 text-sm font-semibold text-white"
          >
            Add expense
          </Link>
        </div>
      ) : null}

      {projection.balance.ok && projection.expenses.length > 0 ? (
        <ul className="space-y-2">
          {projection.balance.balances.map((line) => (
            <li
              key={line.memberId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3"
            >
              <div>
                <p className="font-semibold">{nameOf(line.memberId)}</p>
                <p
                  className={cx(
                    "text-sm",
                    line.balanceMinor > 0 ? "text-teal" : line.balanceMinor < 0 ? "text-bad" : "text-muted",
                  )}
                >
                  {line.balanceMinor > 0 ? "Gets back" : line.balanceMinor < 0 ? "Owes" : "Settled"}
                </p>
              </div>
              <p
                className={cx(
                  "font-display text-2xl tabular-nums",
                  line.balanceMinor > 0 ? "text-teal" : line.balanceMinor < 0 ? "text-bad" : "text-ink",
                )}
              >
                {formatMoney(Math.abs(line.balanceMinor), currency, exponent)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {projection.balance.ok && projection.expenses.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl">Settle up</h2>
          {projection.transfers.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Everyone is settled up.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {projection.transfers.map((transfer) => (
                <li
                  key={`${transfer.fromMemberId}-${transfer.toMemberId}-${transfer.amountMinor}`}
                  className="rounded-2xl border border-line bg-card p-4"
                >
                  <p className="text-sm text-muted">
                    {nameOf(transfer.fromMemberId)} pays {nameOf(transfer.toMemberId)}
                  </p>
                  <p className="mt-1 font-display text-3xl tabular-nums">
                    {formatMoney(transfer.amountMinor, currency, exponent)}
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() =>
                      navigate(`/trip/${bundle.trip.id}/settlement/new`, {
                        state: {
                          fromMemberId: transfer.fromMemberId,
                          toMemberId: transfer.toMemberId,
                          amountMinor: transfer.amountMinor,
                          currency,
                        },
                      })
                    }
                  >
                    Record payment
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {projection.settlements.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl">Payments</h2>
            <Link to={`/trip/${bundle.trip.id}/settlement/new`} className="text-sm font-semibold text-teal">
              Add
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {projection.settlements.map((settlement) => {
              const exp = getCurrency(settlement.currency).exponent;
              return (
                <li key={settlement.id}>
                  <Link
                    to={`/trip/${bundle.trip.id}/settlement/${settlement.id}`}
                    className="block rounded-2xl border border-line bg-card px-4 py-3"
                  >
                    <p className="font-semibold">
                      {nameOf(settlement.fromMemberId)} paid {nameOf(settlement.toMemberId)}
                    </p>
                    <p className="text-sm text-muted">
                      {formatDisplayDate(settlement.date)}
                      {settlement.note ? ` · ${settlement.note}` : ""}
                    </p>
                    <p className="mt-1 tabular-nums">
                      {formatMoney(settlement.amountMinor, settlement.currency, exp)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : projection.balance.ok && projection.expenses.length > 0 ? (
        <Link to={`/trip/${bundle.trip.id}/settlement/new`} className="inline-flex text-sm font-semibold text-teal">
          Record a different payment
        </Link>
      ) : null}
    </PageBody>
  );
}

function ExpensesTab({ bundle }: { bundle: TripBundle }) {
  const projection = useMemo(() => projectTrip(bundle), [bundle]);
  const names = new Map(projection.members.map((member) => [member.id, member.name]));
  const groups: { date: string; items: typeof projection.expenses }[] = [];
  for (const expense of projection.expenses) {
    const last = groups[groups.length - 1];
    if (!last || last.date !== expense.record.date) {
      groups.push({ date: expense.record.date, items: [expense] });
    } else {
      last.items.push(expense);
    }
  }

  return (
    <PageBody className="pb-28">
      {projection.expenses.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-5 py-8">
          <h2 className="font-display text-2xl">Nothing spent yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Add a dinner, a train ticket, or the apartment. You can split it equally or by amounts, percentages, or
            shares.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
                {formatDisplayDate(group.date)}
              </h2>
              <ul className="mt-2 space-y-2">
                {group.items.map(({ record }) => {
                  const exponent = getCurrency(record.currency).exponent;
                  const converted =
                    record.currency === bundle.trip.defaultCurrency
                      ? null
                      : toDefaultMinor(bundle, record.amountMinor, record.currency);
                  return (
                    <li key={record.id}>
                      <Link
                        to={`/trip/${bundle.trip.id}/expense/${record.id}`}
                        className="block rounded-2xl border border-line bg-card px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{record.description}</p>
                            <p className="text-sm text-muted">
                              {names.get(record.paidByMemberId) ?? "Someone"} paid · {splitLabel(record.splitMode)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold tabular-nums">
                              {formatMoney(record.amountMinor, record.currency, exponent)}
                            </p>
                            {converted !== null ? (
                              <p className="text-xs text-muted tabular-nums">
                                ≈{" "}
                                {formatMoney(
                                  converted,
                                  bundle.trip.defaultCurrency,
                                  getCurrency(bundle.trip.defaultCurrency).exponent,
                                )}
                              </p>
                            ) : record.currency !== bundle.trip.defaultCurrency ? (
                              <p className="text-xs text-clay">Rate needed</p>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div className="mx-auto max-w-lg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Link
            to={`/trip/${bundle.trip.id}/expense/new`}
            className="pointer-events-auto flex min-h-12 items-center justify-center rounded-2xl bg-teal text-sm font-semibold text-white shadow-lg"
          >
            Add expense
          </Link>
        </div>
      </div>
    </PageBody>
  );
}

function TripTab({ bundle, onOpenBalances }: { bundle: TripBundle; onOpenBalances: () => void }) {
  const navigate = useNavigate();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [tripName, setTripName] = useState(bundle.trip.name);
  const [person, setPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const currencies = foreignCurrencies(bundle);

  async function onRename(event: FormEvent) {
    event.preventDefault();
    const result = await renameTrip(bundle.trip.id, tripName);
    if (!result.ok) {
      setRenameError(result.error);
      return;
    }
    setRenameOpen(false);
    setRenameError(null);
  }

  async function onAddPerson(event: FormEvent) {
    event.preventDefault();
    const result = await addMember(bundle.trip.id, person);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPerson("");
    setError(null);
  }

  return (
    <PageBody className="space-y-8 pb-12">
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Trip currency</p>
            <p className="mt-1 font-display text-3xl">{bundle.trip.defaultCurrency}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setTripName(bundle.trip.name);
              setRenameError(null);
              setRenameOpen(true);
            }}
          >
            Rename
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl">People</h2>
        <ul className="mt-3 space-y-2">
          {sortMembers(bundle.members).map((member) => (
            <MemberRow key={member.id} member={member} onError={setError} />
          ))}
        </ul>
        <form className="mt-3 flex gap-2" onSubmit={(event) => void onAddPerson(event)}>
          <input
            className={controlClass}
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            placeholder="Add a person"
            aria-label="Person's name"
            autoComplete="off"
            maxLength={40}
          />
          <Button type="submit">Add</Button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl">Exchange rates</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Enter how many {bundle.trip.defaultCurrency} you get for 1 unit of the other currency. One rate applies to
          every expense in that currency. Editing it recalculates the balances.
        </p>
        {currencies.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Rates show up here when an expense uses another currency.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {currencies.map((code) => {
              const saved = bundle.rates.find((rate) => rate.currency === code);
              let initial = "";
              if (saved) {
                try {
                  initial = rateScaledToInput(BigInt(saved.rateScaled));
                } catch {
                  initial = "";
                }
              }
              return (
                <RateRow
                  key={`${code}:${saved?.rateScaled ?? ""}`}
                  tripId={bundle.trip.id}
                  currency={code}
                  defaultCurrency={bundle.trip.defaultCurrency}
                  initial={initial}
                  onError={setError}
                  onSaved={() => setError(null)}
                />
              );
            })}
          </ul>
        )}
        {currencies.length > 0 ? (
          <button type="button" className="mt-3 text-sm font-semibold text-teal" onClick={onOpenBalances}>
            See balances
          </button>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-2xl">Backup</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          JSON keeps the whole trip. CSV is a spreadsheet of expenses and payments. Import a JSON file from the home
          screen — it creates a new copy.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                `${slugify(bundle.trip.name)}.json`,
                serializeBackup(tripToBackup(bundle)),
                "application/json",
              )
            }
          >
            Export JSON
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(`${slugify(bundle.trip.name)}.csv`, buildTripCsv(tripToBackup(bundle)), "text/csv")
            }
          >
            Export CSV
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-bad">Delete trip</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Removes this trip from this device only.</p>
        <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
          Delete trip
        </Button>
      </section>

      <Dialog open={renameOpen} title="Rename trip" onClose={() => setRenameOpen(false)}>
        <form className="space-y-4" onSubmit={(event) => void onRename(event)}>
          {renameError ? <Notice tone="bad">{renameError}</Notice> : null}
          <Field label="Name">
            <input
              className={controlClass}
              value={tripName}
              onChange={(event) => setTripName(event.target.value)}
              autoComplete="off"
              maxLength={60}
              required
            />
          </Field>
          <Button type="submit" className="w-full">
            Save name
          </Button>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this trip?"
        body={`Delete “${bundle.trip.name}” and every expense on it? Export a backup first if you might want it later.`}
        confirmLabel="Delete trip"
        pending={pending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setPending(true);
          void deleteTrip(bundle.trip.id).then((result) => {
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              setConfirmDelete(false);
              return;
            }
            navigate("/");
          });
        }}
      />
    </PageBody>
  );
}

function MemberRow({ member, onError }: { member: MemberRecord; onError: (message: string | null) => void }) {
  const [name, setName] = useState(member.name);
  const [confirm, setConfirm] = useState(false);

  async function commit() {
    if (name.trim() === member.name) return;
    const result = await renameMember(member.id, name);
    if (!result.ok) {
      onError(result.error);
      setName(member.name);
      return;
    }
    onError(null);
  }

  return (
    <li className="flex items-center gap-2">
      <input
        className={controlClass}
        value={name}
        aria-label={`Name for ${member.name}`}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={confirm}
        title={`Remove ${member.name}?`}
        body="You can only remove someone who is not on an expense or payment."
        confirmLabel="Remove"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          void removeMember(member.id).then((result) => {
            setConfirm(false);
            onError(result.ok ? null : result.error);
          });
        }}
      />
    </li>
  );
}

function RateRow({
  tripId,
  currency,
  defaultCurrency,
  initial,
  onError,
  onSaved,
}: {
  tripId: string;
  currency: string;
  defaultCurrency: string;
  initial: string;
  onError: (message: string | null) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const result = await saveRate(tripId, currency, value);
    setPending(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <li className={cx("rounded-2xl border bg-card p-3", initial ? "border-line" : "border-clay bg-[#fff6f0]")}>
      <label className="block text-sm font-semibold">
        1 {currency} =
        <span className="mt-2 flex items-center gap-2">
          <input
            className={controlClass}
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="0.92"
            aria-label={`Exchange rate for ${currency}`}
          />
          <span className="shrink-0 text-muted">{defaultCurrency}</span>
        </span>
      </label>
      <Button variant="secondary" className="mt-3 w-full" disabled={pending} onClick={() => void save()}>
        Save {currency} rate
      </Button>
    </li>
  );
}
