import { describe, expect, it } from "vitest";
import { buildTripCsv, parseTripBackup, rekeyBackup, serializeBackup, type TripBackup } from "./export";

function sampleBackup(): TripBackup {
  return {
    format: "split-bill",
    version: 1,
    exportedAt: "2026-10-18T12:00:00.000Z",
    trip: {
      name: "Lisbon weekend",
      defaultCurrency: "EUR",
      createdAt: 1,
      updatedAt: 2,
    },
    members: [
      { id: "a", name: "Alex", createdAt: 1 },
      { id: "b", name: "Sam", createdAt: 2 },
    ],
    rates: [{ currency: "USD", rateScaled: "92000000", updatedAt: 2 }],
    expenses: [
      {
        id: "e1",
        description: 'Dinner "Time Out"',
        amountMinor: 100,
        currency: "EUR",
        date: "2026-10-16",
        paidByMemberId: "a",
        splitMode: "equal",
        parts: [
          { memberId: "a", value: 1 },
          { memberId: "b", value: 1 },
        ],
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: "e2",
        description: "=cmd snack",
        amountMinor: 200,
        currency: "USD",
        date: "2026-10-17",
        paidByMemberId: "b",
        splitMode: "exact",
        parts: [
          { memberId: "a", value: 150 },
          { memberId: "b", value: 50 },
        ],
        createdAt: 4,
        updatedAt: 4,
      },
    ],
    settlements: [
      {
        id: "s1",
        fromMemberId: "b",
        toMemberId: "a",
        amountMinor: 50,
        currency: "EUR",
        date: "2026-10-18",
        note: "Cash",
        createdAt: 5,
        updatedAt: 5,
      },
    ],
  };
}

describe("trip backup", () => {
  it("round-trips a valid backup and rejects a split that does not add up", () => {
    const parsed = parseTripBackup(serializeBackup(sampleBackup()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.trip.name).toBe("Lisbon weekend");
    expect(parsed.backup.expenses).toHaveLength(2);

    const broken = sampleBackup();
    broken.expenses[1] = {
      ...broken.expenses[1]!,
      parts: [
        { memberId: "a", value: 10 },
        { memberId: "b", value: 10 },
      ],
    };
    const rejected = parseTripBackup(JSON.stringify(broken));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toMatch(/add up/);
  });

  it("gives an imported copy new ids while keeping who paid whom", () => {
    const parsed = parseTripBackup(JSON.stringify(sampleBackup()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let n = 0;
    const copy = rekeyBackup(parsed.backup, () => `id-${n++}`);
    expect(copy.members.map((member) => member.id)).toEqual(["id-0", "id-1"]);
    expect(copy.expenses[0]?.paidByMemberId).toBe("id-0");
    expect(copy.expenses[0]?.parts.map((part) => part.memberId)).toEqual(["id-0", "id-1"]);
    expect(copy.settlements[0]).toMatchObject({ fromMemberId: "id-1", toMemberId: "id-0" });
    expect(parseTripBackup(JSON.stringify(copy)).ok).toBe(true);
  });

  it("rejects the wrong format, a missing person, and an unknown currency", () => {
    expect(parseTripBackup("{").ok).toBe(false);
    expect(parseTripBackup(JSON.stringify({ format: "other", version: 1 })).ok).toBe(false);
    const missingPerson = sampleBackup();
    missingPerson.expenses[0] = { ...missingPerson.expenses[0]!, paidByMemberId: "nope" };
    expect(parseTripBackup(JSON.stringify(missingPerson)).ok).toBe(false);
    const unknown = sampleBackup();
    unknown.trip = { ...unknown.trip, defaultCurrency: "XYZ" };
    expect(parseTripBackup(JSON.stringify(unknown)).ok).toBe(false);
  });
});

describe("buildTripCsv", () => {
  it("exports expenses and settlements with escaped text and a converted amount", () => {
    const csv = buildTripCsv(sampleBackup());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("date,type,description");
    expect(csv).toContain('"Dinner ""Time Out"""');
    expect(csv).toContain("'=cmd snack");
    expect(csv).toContain("expense,");
    expect(csv).toContain("1.84");
    expect(csv).toContain("settlement");
    expect(csv).toContain("Sam");
    expect(csv).toContain("Alex: 0.5; Sam: 0.5");
  });
});
