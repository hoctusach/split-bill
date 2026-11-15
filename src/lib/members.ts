export interface OrderedMember {
  id: string;
  createdAt: number;
}

/** Stable person order: first added stays first. Renames do not move anyone. */
export function compareMembers(a: OrderedMember, b: OrderedMember): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortMembers<T extends OrderedMember>(members: readonly T[]): T[] {
  return members.slice().sort(compareMembers);
}

/** Keep split rows in the order people were added so leftover cents stay put. */
export function orderByMembers<T extends { memberId: string }>(
  rows: readonly T[],
  members: readonly OrderedMember[],
): T[] {
  const index = new Map(sortMembers(members).map((member, position) => [member.id, position]));
  return rows.slice().sort((a, b) => {
    const left = index.get(a.memberId) ?? Number.MAX_SAFE_INTEGER;
    const right = index.get(b.memberId) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
}
