import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loading, MissingTrip, PageBody, TopBar, usePageTitle } from "../components/Screen";
import { Button, ConfirmDialog, Field, Notice, Segmented, controlClass, cx } from "../components/ui";
import { deleteExpense, saveExpense } from "../db/repository";
import { useTripBundle } from "../db/useTripData";
import { toDefaultMinor } from "../domain/projectTrip";
import type { ExpenseRecord, TripBundle } from "../domain/types";
import { currencyChoices, getCurrency } from "../lib/currency";
import { todayIsoDate } from "../lib/dates";
import { sortMembers } from "../lib/members";
import { formatMoney, minorToDecimalString, parseDecimalToMinor } from "../lib/money";
import {
  allocateByWeights,
  computeSplit,
  equalBasisPoints,
  type SplitMode,
  type SplitPart,
} from "../lib/split";

const MODES: { value: SplitMode; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "exact", label: "Amount" },
  { value: "percentage", label: "Percent" },
  { value: "shares", label: "Shares" },
];

interface FormState {
  description: string;
  amount: string;
  currency: string;
  date: string;
  paidByMemberId: string;
  mode: SplitMode;
  included: Record<string, boolean>;
  exact: Record<string, string>;
  percent: Record<string, string>;
  shares: Record<string, string>;
}

function initialState(bundle: TripBundle, expense: ExpenseRecord | undefined): FormState {
  const members = sortMembers(bundle.members);
  const included: Record<string, boolean> = {};
  const exact: Record<string, string> = {};
  const percent: Record<string, string> = {};
  const shares: Record<string, string> = {};
  const bps = new Map(
    equalBasisPoints(members.map((member) => member.id)).map((part) => [part.memberId, part.value]),
  );
  for (const member of members) {
    included[member.id] = true;
    exact[member.id] = "";
    percent[member.id] = minorToDecimalString(bps.get(member.id) ?? 0, 2);
    shares[member.id] = "1";
  }
  if (!expense) {
    return {
      description: "",
      amount: "",
      currency: bundle.trip.defaultCurrency,
      date: todayIsoDate(),
      paidByMemberId: members[0]?.id ?? "",
      mode: "equal",
      included,
      exact,
      percent,
      shares,
    };
  }
  const exponent = getCurrency(expense.currency).exponent;
  if (expense.splitMode === "equal") {
    for (const member of members) included[member.id] = false;
    for (const part of expense.parts) included[part.memberId] = true;
  }
  if (expense.splitMode === "exact") {
    for (const member of members) exact[member.id] = "";
    for (const part of expense.parts) {
      if (part.value > 0) exact[part.memberId] = minorToDecimalString(part.value, exponent);
    }
  }
  if (expense.splitMode === "percentage") {
    for (const member of members) percent[member.id] = "0";
    for (const part of expense.parts) percent[part.memberId] = minorToDecimalString(part.value, 2);
  }
  if (expense.splitMode === "shares") {
    for (const member of members) shares[member.id] = "0";
    for (const part of expense.parts) shares[part.memberId] = String(part.value);
  }
  return {
    description: expense.description,
    amount: minorToDecimalString(expense.amountMinor, exponent),
    currency: expense.currency,
    date: expense.date,
    paidByMemberId: expense.paidByMemberId,
    mode: expense.splitMode,
    included,
    exact,
    percent,
    shares,
  };
}

type BuiltParts = { ok: true; parts: SplitPart[] } | { ok: false; error: string };

function buildParts(state: FormState, bundle: TripBundle): BuiltParts {
  const members = sortMembers(bundle.members);
  const exponent = getCurrency(state.currency).exponent;
  if (state.mode === "equal") {
    const parts = members
      .filter((member) => state.included[member.id])
      .map((member) => ({ memberId: member.id, value: 1 }));
    if (parts.length === 0) return { ok: false, error: "Choose at least one person to include." };
    return { ok: true, parts };
  }
  if (state.mode === "exact") {
    const parts: SplitPart[] = [];
    for (const member of members) {
      const raw = state.exact[member.id] ?? "";
      if (!raw.trim()) {
        parts.push({ memberId: member.id, value: 0 });
        continue;
      }
      const minor = parseDecimalToMinor(raw, exponent);
      if (minor === null || minor < 0) return { ok: false, error: `Check the amount for ${member.name}.` };
      parts.push({ memberId: member.id, value: minor });
    }
    return { ok: true, parts };
  }
  if (state.mode === "percentage") {
    const parts: SplitPart[] = [];
    for (const member of members) {
      const raw = (state.percent[member.id] ?? "").trim();
      if (!raw) return { ok: false, error: `Enter a percentage for ${member.name}.` };
      const bps = parseDecimalToMinor(raw, 2);
      if (bps === null || bps < 0 || bps > 10_000) {
        return { ok: false, error: `Check the percentage for ${member.name}. Use at most 2 decimal places.` };
      }
      parts.push({ memberId: member.id, value: bps });
    }
    return { ok: true, parts };
  }
  const parts: SplitPart[] = [];
  for (const member of members) {
    const raw = (state.shares[member.id] ?? "").trim();
    if (!raw) {
      parts.push({ memberId: member.id, value: 0 });
      continue;
    }
    if (!/^\d{1,6}$/.test(raw)) return { ok: false, error: `Shares for ${member.name} must be a whole number.` };
    parts.push({ memberId: member.id, value: Number(raw) });
  }
  return { ok: true, parts };
}

export function ExpensePage() {
  const { tripId = "", expenseId } = useParams();
  const bundle = useTripBundle(tripId);
  usePageTitle(expenseId ? "Edit expense" : "Add expense");
  if (bundle === undefined) return <Loading />;
  if (!bundle) return <MissingTrip />;
  const expense = expenseId ? bundle.expenses.find((item) => item.id === expenseId) : undefined;
  if (expenseId && !expense) {
    return (
      <div>
        <TopBar title="Expense" backTo={`/trip/${tripId}?tab=expenses`} />
        <PageBody>
          <p className="text-sm text-muted">That expense is not on this trip.</p>
        </PageBody>
      </div>
    );
  }
  return <ExpenseForm key={expense?.updatedAt ?? "new"} bundle={bundle} expense={expense} />;
}

function ExpenseForm({ bundle, expense }: { bundle: TripBundle; expense: ExpenseRecord | undefined }) {
  const navigate = useNavigate();
  const members = sortMembers(bundle.members);
  const [state, setState] = useState(() => initialState(bundle, expense));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exponent = getCurrency(state.currency).exponent;
  const amountMinor = parseDecimalToMinor(state.amount, exponent);
  const built = useMemo(() => buildParts(state, bundle), [state, bundle]);
  const names = new Map(members.map((member) => [member.id, member.name]));

  const split =
    built.ok && amountMinor !== null && amountMinor > 0
      ? computeSplit({ amountMinor, mode: state.mode, parts: built.parts })
      : null;

  const converted =
    amountMinor !== null && amountMinor > 0 && state.currency !== bundle.trip.defaultCurrency
      ? toDefaultMinor(bundle, amountMinor, state.currency)
      : null;

  function patch(partial: Partial<FormState>) {
    setState((current) => ({ ...current, ...partial }));
  }

  function fillEqually() {
    if (state.mode === "exact") {
      if (amountMinor === null || amountMinor <= 0) return;
      const shares = allocateByWeights(
        amountMinor,
        members.map((member) => ({ memberId: member.id, weight: 1 })),
      );
      const exact = { ...state.exact };
      for (const share of shares) exact[share.memberId] = minorToDecimalString(share.amountMinor, exponent);
      patch({ exact });
    } else if (state.mode === "percentage") {
      const percent = { ...state.percent };
      for (const part of equalBasisPoints(members.map((member) => member.id))) {
        percent[part.memberId] = minorToDecimalString(part.value, 2);
      }
      patch({ percent });
    } else if (state.mode === "shares") {
      const shares = { ...state.shares };
      for (const member of members) shares[member.id] = "1";
      patch({ shares });
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (amountMinor === null || amountMinor <= 0) {
      setError(exponent === 0 ? "Enter a whole number greater than zero." : "Enter an amount greater than zero.");
      return;
    }
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const checked = computeSplit({ amountMinor, mode: state.mode, parts: built.parts });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setPending(true);
    const result = await saveExpense(bundle.trip.id, {
      id: expense?.id,
      description: state.description,
      amountMinor,
      currency: state.currency,
      date: state.date,
      paidByMemberId: state.paidByMemberId,
      splitMode: state.mode,
      parts: built.parts,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/trip/${bundle.trip.id}?tab=expenses`);
  }

  const guidance = guidanceText(state, members, amountMinor, exponent);

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <TopBar title={expense ? "Edit expense" : "Add expense"} backTo={`/trip/${bundle.trip.id}?tab=expenses`} />
      <PageBody className="space-y-4 pb-10">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Field label="Description">
          <input
            className={controlClass}
            value={state.description}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="Dinner"
            autoComplete="off"
            maxLength={120}
            required
          />
        </Field>
        <Field
          label="Amount"
          hint={exponent === 0 ? "This currency has no decimals." : "Use a dot or a comma for decimals."}
        >
          <div className="relative">
            <input
              className={cx(controlClass, "pr-16")}
              inputMode="decimal"
              value={state.amount}
              onChange={(event) => patch({ amount: event.target.value })}
              placeholder={exponent === 0 ? "1500" : "0.00"}
              required
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-muted">
              {state.currency}
            </span>
          </div>
        </Field>
        <Field label="Currency">
          <select
            className={controlClass}
            value={state.currency}
            onChange={(event) => patch({ currency: event.target.value })}
          >
            {currencyChoices().map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.name}
              </option>
            ))}
          </select>
        </Field>
        {state.currency !== bundle.trip.defaultCurrency ? (
          <Notice>
            {converted === null
              ? `Balances use ${bundle.trip.defaultCurrency}. Add a ${state.currency} rate on the Trip tab.`
              : `About ${formatMoney(converted, bundle.trip.defaultCurrency, getCurrency(bundle.trip.defaultCurrency).exponent)} in this trip, using the saved rate.`}
          </Notice>
        ) : null}
        <Field label="Date">
          <input
            className={controlClass}
            type="date"
            value={state.date}
            onChange={(event) => patch({ date: event.target.value })}
            required
          />
        </Field>
        <Field label="Paid by">
          <select
            className={controlClass}
            value={state.paidByMemberId}
            onChange={(event) => patch({ paidByMemberId: event.target.value })}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Split</p>
            {state.mode !== "equal" ? (
              <button type="button" className="text-sm font-semibold text-teal" onClick={fillEqually}>
                Fill equally
              </button>
            ) : null}
          </div>
          <Segmented label="Split" value={state.mode} options={MODES} onChange={(mode) => patch({ mode })} />
          {state.mode === "equal" ? (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-card px-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-teal"
                      checked={state.included[member.id] ?? false}
                      onChange={(event) =>
                        patch({ included: { ...state.included, [member.id]: event.target.checked } })
                      }
                    />
                    <span>{member.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {state.mode === "exact" ? (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                  <span className="text-sm font-medium">{member.name}</span>
                  <input
                    className={controlClass}
                    inputMode="decimal"
                    aria-label={`Amount for ${member.name}`}
                    value={state.exact[member.id] ?? ""}
                    placeholder="0"
                    onChange={(event) => patch({ exact: { ...state.exact, [member.id]: event.target.value } })}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {state.mode === "percentage" ? (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                  <span className="text-sm font-medium">{member.name}</span>
                  <input
                    className={controlClass}
                    inputMode="decimal"
                    aria-label={`Percentage for ${member.name}`}
                    value={state.percent[member.id] ?? ""}
                    onChange={(event) =>
                      patch({ percent: { ...state.percent, [member.id]: event.target.value } })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {state.mode === "shares" ? (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                  <span className="text-sm font-medium">{member.name}</span>
                  <input
                    className={controlClass}
                    inputMode="numeric"
                    aria-label={`Shares for ${member.name}`}
                    value={state.shares[member.id] ?? ""}
                    onChange={(event) => patch({ shares: { ...state.shares, [member.id]: event.target.value } })}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {guidance ? <p className="text-sm text-muted">{guidance}</p> : null}
          {split && split.ok ? (
            <ul className="rounded-2xl bg-teal-soft px-4 py-3">
              {split.shares.map((share) => (
                <li key={share.memberId} className="flex justify-between gap-3 py-1 text-sm">
                  <span>{names.get(share.memberId) ?? "Someone"}</span>
                  <span className="tabular-nums">{formatMoney(share.amountMinor, state.currency, exponent)}</span>
                </li>
              ))}
            </ul>
          ) : split && !split.ok ? (
            <p className="text-sm text-bad">{split.error}</p>
          ) : !built.ok ? (
            <p className="text-sm text-bad">{built.error}</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" disabled={pending}>
          Save expense
        </Button>
        {expense ? (
          <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirmDelete(true)}>
            Delete expense
          </Button>
        ) : null}
      </PageBody>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this expense?"
        body="Balances update as soon as it is gone."
        confirmLabel="Delete expense"
        pending={pending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!expense) return;
          setPending(true);
          void deleteExpense(bundle.trip.id, expense.id).then((result) => {
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              setConfirmDelete(false);
              return;
            }
            navigate(`/trip/${bundle.trip.id}?tab=expenses`);
          });
        }}
      />
    </form>
  );
}

function guidanceText(
  state: FormState,
  members: TripBundle["members"],
  amountMinor: number | null,
  exponent: number,
): string | null {
  if (state.mode === "exact") {
    if (amountMinor === null) return null;
    let assigned = 0;
    for (const member of members) {
      const raw = state.exact[member.id] ?? "";
      if (!raw.trim()) continue;
      const minor = parseDecimalToMinor(raw, exponent);
      if (minor === null || minor < 0) return null;
      assigned += minor;
    }
    const delta = amountMinor - assigned;
    if (delta === 0) return "Amounts match the total.";
    if (delta > 0) return `${formatMoney(delta, state.currency, exponent)} left to assign.`;
    return `${formatMoney(-delta, state.currency, exponent)} over the total.`;
  }
  if (state.mode === "percentage") {
    let bps = 0;
    for (const member of members) {
      const raw = (state.percent[member.id] ?? "").trim();
      if (!raw) return null;
      const parsed = parseDecimalToMinor(raw, 2);
      if (parsed === null) return null;
      bps += parsed;
    }
    const delta = 10_000 - bps;
    if (delta === 0) return "Percentages add up to 100%.";
    const text = minorToDecimalString(Math.abs(delta), 2);
    return delta > 0 ? `${text}% left to assign.` : `${text}% over 100%.`;
  }
  return null;
}
