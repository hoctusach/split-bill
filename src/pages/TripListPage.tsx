import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loading } from "../components/Screen";
import { usePageTitle } from "../components/Screen";
import { Button, Dialog, Field, Mark, Notice, controlClass } from "../components/ui";
import { loadSampleTrip } from "../db/sampleTrip";
import { createTrip, importTripBackup } from "../db/repository";
import { useTripList } from "../db/useTripData";
import { currencyChoices, suggestedCurrency } from "../lib/currency";

export function TripListPage() {
  usePageTitle("Split Bill");
  const trips = useTripList();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(() => suggestedCurrency(navigator.language));
  const [people, setPeople] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const memberNames = people
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const result = await createTrip({ name, defaultCurrency: currency, memberNames });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setOpen(false);
    setName("");
    setPeople("");
    setFormError(null);
    setError(null);
    navigate(`/trip/${result.id}`);
  }

  async function onImport(file: File) {
    const text = await file.text();
    const result = await importTripBackup(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    navigate(`/trip/${result.id}`);
  }

  async function onSample() {
    setBusy(true);
    const result = await loadSampleTrip();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/trip/${result.id}`);
  }

  return (
    <div className="px-4 pt-6 pb-12">
      <div className="flex items-center gap-3">
        <Mark />
        <div>
          <p className="font-display text-3xl leading-none text-ink">Split Bill</p>
          <p className="mt-1 text-sm text-muted">Trip expenses, kept on this device.</p>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          onClick={() => {
            setFormError(null);
            setOpen(true);
          }}
        >
          New trip
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onImport(file);
          }}
        />
      </div>

      {trips === undefined ? (
        <Loading label="Loading trips…" />
      ) : trips.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card px-5 py-8">
          <h2 className="font-display text-2xl text-ink">No trips yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Start a weekend, a shared house, or any group. Names stay on this phone or computer — there is no account.
          </p>
          <Button variant="secondary" className="mt-5" disabled={busy} onClick={() => void onSample()}>
            Load a sample trip
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {trips.map(({ trip, members, expenses }) => (
            <li key={trip.id}>
              <Link
                to={`/trip/${trip.id}`}
                className="block rounded-2xl border border-line bg-card px-4 py-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl leading-tight text-ink">{trip.name}</h2>
                  <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-semibold text-teal">
                    {trip.defaultCurrency}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {members} {members === 1 ? "person" : "people"} · {expenses}{" "}
                  {expenses === 1 ? "expense" : "expenses"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs leading-5 text-muted">
        Nothing is uploaded. Export a trip as JSON if you want a backup or to move it to another device. You can also
        install this page and open it offline.
        {trips && trips.length > 0 ? (
          <>
            {" "}
            <button type="button" className="font-semibold text-teal" disabled={busy} onClick={() => void onSample()}>
              Load a sample trip
            </button>
          </>
        ) : null}
      </p>

      <Dialog
        open={open}
        title="New trip"
        onClose={() => {
          setOpen(false);
          setFormError(null);
        }}
      >
        <form className="space-y-4" onSubmit={(event) => void onCreate(event)}>
          {formError ? <Notice tone="bad">{formError}</Notice> : null}
          <Field label="Trip name">
            <input
              className={controlClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Lisbon weekend"
              autoComplete="off"
              required
              maxLength={60}
            />
          </Field>
          <Field label="Currency" hint="Balances are shown in this currency. It stays fixed for the trip.">
            <select className={controlClass} value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {currencyChoices().map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} — {option.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="People" hint="Separate names with commas. You can add more later.">
            <input
              className={controlClass}
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              placeholder="Alex, Sam, Jordan"
              autoComplete="off"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            Create trip
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
