import type { ResultWithId } from "../domain/types";
import { sortMembers } from "../lib/members";
import { createTrip, getTripBundle, saveExpense, saveRate } from "./repository";

/** A small offline example so the first screen is not a blank form. */
export async function loadSampleTrip(): Promise<ResultWithId> {
  const created = await createTrip({
    name: "Lisbon weekend",
    defaultCurrency: "EUR",
    memberNames: ["Alex", "Sam", "Jordan"],
  });
  if (!created.ok) return created;
  const bundle = await getTripBundle(created.id);
  if (!bundle) return { ok: false, error: "Could not create the sample trip." };
  const [alex, sam, jordan] = sortMembers(bundle.members);
  if (!alex || !sam || !jordan) return { ok: false, error: "Could not create the sample trip." };

  const expenses = [
    {
      description: "Apartment",
      amountMinor: 42000,
      currency: "EUR",
      date: "2026-10-16",
      paidByMemberId: alex.id,
      splitMode: "equal" as const,
      parts: [alex, sam, jordan].map((member) => ({ memberId: member.id, value: 1 })),
    },
    {
      description: "Dinner",
      amountMinor: 9600,
      currency: "EUR",
      date: "2026-10-16",
      paidByMemberId: sam.id,
      splitMode: "shares" as const,
      parts: [
        { memberId: alex.id, value: 2 },
        { memberId: sam.id, value: 1 },
        { memberId: jordan.id, value: 1 },
      ],
    },
    {
      description: "Tram cards",
      amountMinor: 3660,
      currency: "EUR",
      date: "2026-10-17",
      paidByMemberId: jordan.id,
      splitMode: "equal" as const,
      parts: [alex, sam, jordan].map((member) => ({ memberId: member.id, value: 1 })),
    },
    {
      description: "Airport snacks",
      amountMinor: 2400,
      currency: "USD",
      date: "2026-10-18",
      paidByMemberId: alex.id,
      splitMode: "equal" as const,
      parts: [alex, sam, jordan].map((member) => ({ memberId: member.id, value: 1 })),
    },
  ];

  for (const expense of expenses) {
    const saved = await saveExpense(created.id, expense);
    if (!saved.ok) return saved;
  }
  const rate = await saveRate(created.id, "USD", "0.92");
  if (!rate.ok) return { ok: false, error: rate.error };
  return created;
}
