import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { getTripBundle } from "./repository";

export function useTripList() {
  return useLiveQuery(async () => {
    const trips = await db.trips.orderBy("updatedAt").reverse().toArray();
    const cards = [];
    for (const trip of trips) {
      const [members, expenses] = await Promise.all([
        db.members.where("tripId").equals(trip.id).count(),
        db.expenses.where("tripId").equals(trip.id).count(),
      ]);
      cards.push({ trip, members, expenses });
    }
    return cards;
  }, []);
}

export function useTripBundle(tripId: string | undefined) {
  return useLiveQuery(async () => {
    if (!tripId) return null;
    return getTripBundle(tripId);
  }, [tripId]);
}
