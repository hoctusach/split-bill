import Dexie, { type Table } from "dexie";
import type { ExpenseRecord, MemberRecord, RateRecord, SettlementRecord, TripRecord } from "../domain/types";

export class SplitBillDB extends Dexie {
  trips!: Table<TripRecord, string>;
  members!: Table<MemberRecord, string>;
  rates!: Table<RateRecord, string>;
  expenses!: Table<ExpenseRecord, string>;
  settlements!: Table<SettlementRecord, string>;

  constructor() {
    super("split-bill");
    this.version(1).stores({
      trips: "id, updatedAt",
      members: "id, tripId",
      rates: "id, tripId, [tripId+currency]",
      expenses: "id, tripId, date",
      settlements: "id, tripId, date",
    });
  }
}

export const db = new SplitBillDB();
