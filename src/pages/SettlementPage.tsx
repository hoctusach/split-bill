import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loading, MissingTrip, PageBody, TopBar, usePageTitle } from "../components/Screen";
import { Button, ConfirmDialog, Field, Notice, controlClass, cx } from "../components/ui";
import { deleteSettlement, saveSettlement } from "../db/repository";
import { useTripBundle } from "../db/useTripData";
import { toDefaultMinor } from "../domain/projectTrip";
import type { SettlementRecord, TripBundle } from "../domain/types";
import { currencyChoices, getCurrency } from "../lib/currency";
import { todayIsoDate } from "../lib/dates";
import { sortMembers } from "../lib/members";
import { formatMoney, minorToDecimalString, parseDecimalToMinor } from "../lib/money";

interface Prefill {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
}

function readPrefill(state: unknown): Prefill | null {
  if (!state || typeof state !== "object") return null;
  const value = state as Record<string, unknown>;
  if (
    typeof value.fromMemberId !== "string" ||
    typeof value.toMemberId !== "string" ||
    typeof value.amountMinor !== "number" ||
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor <= 0 ||
    typeof value.currency !== "string"
  ) {
    return null;
  }
  return {
    fromMemberId: value.fromMemberId,
    toMemberId: value.toMemberId,
    amountMinor: value.amountMinor,
    currency: value.currency,
  };
}

export function SettlementPage() {
  const { tripId = "", settlementId } = useParams();
  const bundle = useTripBundle(tripId);
  const location = useLocation();
  usePageTitle(settlementId ? "Edit payment" : "Record payment");
  if (bundle === undefined) return <Loading />;
  if (!bundle) return <MissingTrip />;
  const settlement = settlementId ? bundle.settlements.find((item) => item.id === settlementId) : undefined;
  if (settlementId && !settlement) {
    return (
      <div>
        <TopBar title="Payment" backTo={`/trip/${tripId}`} />
        <PageBody>
          <p className="text-sm text-muted">That payment is not on this trip.</p>
        </PageBody>
      </div>
    );
  }
  return (
    <SettlementForm
      key={settlement?.id ?? "new"}
      bundle={bundle}
      settlement={settlement}
      prefill={settlement ? null : readPrefill(location.state)}
    />
  );
}

function SettlementForm({
  bundle,
  settlement,
  prefill,
}: {
  bundle: TripBundle;
  settlement: SettlementRecord | undefined;
  prefill: Prefill | null;
}) {
  const navigate = useNavigate();
  const members = sortMembers(bundle.members);
  const startingCurrency = settlement?.currency ?? prefill?.currency ?? bundle.trip.defaultCurrency;
  const startingExponent = getCurrency(startingCurrency).exponent;
  const [fromMemberId, setFromMemberId] = useState(
    settlement?.fromMemberId ?? prefill?.fromMemberId ?? members[0]?.id ?? "",
  );
  const [toMemberId, setToMemberId] = useState(
    settlement?.toMemberId ?? prefill?.toMemberId ?? members[1]?.id ?? members[0]?.id ?? "",
  );
  const [amount, setAmount] = useState(
    settlement
      ? minorToDecimalString(settlement.amountMinor, getCurrency(settlement.currency).exponent)
      : prefill
        ? minorToDecimalString(prefill.amountMinor, startingExponent)
        : "",
  );
  const [currency, setCurrency] = useState(startingCurrency);
  const [date, setDate] = useState(settlement?.date ?? todayIsoDate());
  const [note, setNote] = useState(settlement?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exponent = getCurrency(currency).exponent;
  const amountMinor = parseDecimalToMinor(amount, exponent);
  const converted =
    amountMinor !== null && amountMinor > 0 && currency !== bundle.trip.defaultCurrency
      ? toDefaultMinor(bundle, amountMinor, currency)
      : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    const result = await saveSettlement(bundle.trip.id, {
      id: settlement?.id,
      fromMemberId,
      toMemberId,
      amountMinor,
      currency,
      date,
      note,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/trip/${bundle.trip.id}`);
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <TopBar title={settlement ? "Edit payment" : "Record payment"} backTo={`/trip/${bundle.trip.id}`} />
      <PageBody className="space-y-4 pb-10">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Field label="Who paid">
          <select className={controlClass} value={fromMemberId} onChange={(event) => setFromMemberId(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who received">
          <select className={controlClass} value={toMemberId} onChange={(event) => setToMemberId(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Amount"
          hint={exponent === 0 ? "This currency has no decimals." : "Use a dot or a comma for decimals."}
        >
          <div className="relative">
            <input
              className={cx(controlClass, "pr-16")}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={exponent === 0 ? "1500" : "0.00"}
              required
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-muted">
              {currency}
            </span>
          </div>
        </Field>
        <Field label="Currency">
          <select className={controlClass} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {currencyChoices().map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.name}
              </option>
            ))}
          </select>
        </Field>
        {currency !== bundle.trip.defaultCurrency ? (
          <Notice>
            {converted === null
              ? `Add a ${currency} rate on the Trip tab before this payment changes balances.`
              : `Counts as ${formatMoney(converted, bundle.trip.defaultCurrency, getCurrency(bundle.trip.defaultCurrency).exponent)} toward balances.`}
          </Notice>
        ) : null}
        <Field label="Date">
          <input
            className={controlClass}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
        <Field label="Note" hint="Optional.">
          <input
            className={controlClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Cash at the airport"
            maxLength={200}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          Save payment
        </Button>
        {settlement ? (
          <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirmDelete(true)}>
            Delete payment
          </Button>
        ) : null}
      </PageBody>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this payment?"
        body="The balances go back to where they were before it was recorded."
        confirmLabel="Delete payment"
        pending={pending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!settlement) return;
          setPending(true);
          void deleteSettlement(bundle.trip.id, settlement.id).then((result) => {
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              setConfirmDelete(false);
              return;
            }
            navigate(`/trip/${bundle.trip.id}`);
          });
        }}
      />
    </form>
  );
}
