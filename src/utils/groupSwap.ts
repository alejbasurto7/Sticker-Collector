import type { Counts, Edition } from '../types';
import type { ParsedList } from './import';
import type { Reservations } from './swap';
import { activeType, buildAlbumFromType } from '../data/albumTypes';

/** A group member reduced to what pool math needs — no store/singleton dependency. */
export interface GroupMember {
  id: string;
  name: string;
  counts: Counts;
  edition: Edition;
  trackCC: boolean;
  /** false for a view-only (read-only joined) member. */
  writable: boolean;
}

/** The set of sticker ids present in a member's own album layout. */
export function memberStickerIds(m: GroupMember): Set<string> {
  // Mirrors sampleAlbum.applyEdition: the CC section is opt-in via trackCC.
  const album = buildAlbumFromType(activeType, {
    variant: m.edition,
    enabledOptional: m.trackCC ? ['CC'] : [],
  });
  return new Set(album.stickers.map((s) => s.id));
}

export interface InternalMove {
  id: string;
  fromId: string;
  toId: string;
}

export interface GroupPool {
  /** id -> external copies wanted from outsiders (writable gaps + view-only needs). */
  get: Record<string, number>;
  /** id -> copies that can be settled into a writable album (writable gaps only). */
  writableGet: Record<string, number>;
  /** id -> external spare copies available to give away (writable surplus only). */
  give: Record<string, number>;
  /** concrete copies to shuffle between writable members. */
  internalMoves: InternalMove[];
}

/** Net the whole group per sticker; see the module's netting rule. Deterministic. */
export function computeGroupPool(members: GroupMember[]): GroupPool {
  const idSets = new Map<string, Set<string>>();
  for (const m of members) idSets.set(m.id, memberStickerIds(m));

  const domain = new Set<string>();
  for (const set of idSets.values()) for (const id of set) domain.add(id);

  const get: Record<string, number> = {};
  const writableGet: Record<string, number> = {};
  const give: Record<string, number> = {};
  const internalMoves: InternalMove[] = [];

  for (const id of [...domain].sort()) {
    const deficitIds: string[] = []; // writable members with count 0
    const surplusUnits: string[] = []; // one entry per writable spare copy, labelled by member id
    let viewDeficit = 0;
    for (const m of members) {
      if (!idSets.get(m.id)!.has(id)) continue;
      const c = m.counts[id] ?? 0;
      if (m.writable) {
        if (c === 0) deficitIds.push(m.id);
        for (let k = 0; k < Math.max(0, c - 1); k++) surplusUnits.push(m.id);
      } else if (c === 0) {
        viewDeficit++;
      }
    }
    const deficit = deficitIds.length;
    const surplus = surplusUnits.length;
    const g = Math.max(0, surplus - deficit);
    const wGet = Math.max(0, deficit - surplus);
    if (g > 0) give[id] = g;
    if (wGet > 0) writableGet[id] = wGet;
    if (wGet + viewDeficit > 0) get[id] = wGet + viewDeficit;
    const pairs = Math.min(deficit, surplus);
    for (let k = 0; k < pairs; k++) {
      internalMoves.push({ id, fromId: surplusUnits[k], toId: deficitIds[k] });
    }
  }
  return { get, writableGet, give, internalMoves };
}

export interface GroupCandidates {
  youGive: string[];
  giveQty: Record<string, number>;
  youGet: string[];
  getQty: Record<string, number>;
  giveReserved: Set<string>;
  getReserved: Set<string>;
}

/**
 * Two-way overlap of another collector's parsed list against the group pool.
 * Mirrors computeCandidates (swap.ts) but over pooled surplus/gaps; reservations
 * flag (never hide) a spare already promised, or a sticker already being received.
 */
export function computeGroupCandidates(
  members: GroupMember[],
  other: ParsedList,
  reservations?: Reservations,
): GroupCandidates {
  const pool = computeGroupPool(members);
  const committedGive = reservations?.committedGive;
  const committedGet = reservations?.committedGet;

  const youGive: string[] = [];
  const giveQty: Record<string, number> = {};
  const giveReserved = new Set<string>();
  const youGet: string[] = [];
  const getQty: Record<string, number> = {};
  const getReserved = new Set<string>();

  for (const id of new Set(other.needs)) {
    const spare = pool.give[id] ?? 0;
    if (spare < 1) continue;
    youGive.push(id);
    giveQty[id] = Math.min(other.needQty?.[id] ?? 1, spare);
    if ((committedGive?.get(id) ?? 0) >= spare) giveReserved.add(id);
  }
  for (const id of new Set(other.swaps)) {
    const want = pool.get[id] ?? 0;
    if (want < 1) continue;
    youGet.push(id);
    getQty[id] = Math.min(want, other.swapQty?.[id] ?? 1);
    if (committedGet?.has(id)) getReserved.add(id);
  }
  return { youGive, giveQty, youGet, getQty, giveReserved, getReserved };
}

export interface ReceiveRouting {
  /** albumId -> stickerId -> copies to ADD (positive). */
  writes: Record<string, Record<string, number>>;
  /** stickers where a limited number of copies was auto-split among 2+ writable needers. */
  ambiguous: { id: string; chosenIds: string[]; options: { id: string; name: string }[] }[];
  /** view-only members missing a received sticker — physical hand-off reminders, never written. */
  handoffs: { id: string; memberId: string; memberName: string }[];
}

function addWrite(
  writes: Record<string, Record<string, number>>,
  albumId: string,
  id: string,
  n: number,
) {
  (writes[albumId] ??= {})[id] = (writes[albumId][id] ?? 0) + n;
}

/** Default routing of received copies to writable needers; view-only needs become reminders. */
export function routeReceived(
  members: GroupMember[],
  received: Record<string, number>,
): ReceiveRouting {
  const idSets = new Map(members.map((m) => [m.id, memberStickerIds(m)]));
  const writes: Record<string, Record<string, number>> = {};
  const ambiguous: ReceiveRouting['ambiguous'] = [];
  const handoffs: ReceiveRouting['handoffs'] = [];

  for (const [id, qty] of Object.entries(received)) {
    if (qty <= 0) continue;
    const includers = members.filter((m) => idSets.get(m.id)!.has(id));
    const writableNeeders = includers.filter((m) => m.writable && (m.counts[id] ?? 0) === 0);
    const assign = Math.min(writableNeeders.length, qty);
    for (let k = 0; k < assign; k++) addWrite(writes, writableNeeders[k].id, id, 1);
    const extra = qty - assign;
    if (extra > 0) {
      const target = includers.find((m) => m.writable);
      if (target) addWrite(writes, target.id, id, extra);
    }
    if (writableNeeders.length > qty && writableNeeders.length > 1) {
      ambiguous.push({
        id,
        chosenIds: writableNeeders.slice(0, qty).map((m) => m.id),
        options: writableNeeders.map((m) => ({ id: m.id, name: m.name })),
      });
    }
    for (const vm of includers.filter((m) => !m.writable && (m.counts[id] ?? 0) === 0)) {
      handoffs.push({ id, memberId: vm.id, memberName: vm.name });
    }
  }
  return { writes, ambiguous, handoffs };
}

export interface GiveRouting {
  /** albumId -> stickerId -> copies to REMOVE (negative). */
  writes: Record<string, Record<string, number>>;
  /** id -> copies the pool could not source (should not happen for pool-derived gives). */
  short: Record<string, number>;
}

/** Route each given copy to a writable member with an unreserved spare (most spares first). */
export function routeGiven(
  members: GroupMember[],
  given: Record<string, number>,
  reservedSpares: Record<string, Record<string, number>> = {},
): GiveRouting {
  const idSets = new Map(members.map((m) => [m.id, memberStickerIds(m)]));
  const writes: Record<string, Record<string, number>> = {};
  const short: Record<string, number> = {};

  for (const [id, qty] of Object.entries(given)) {
    let remaining = qty;
    const sources = members
      .filter((m) => m.writable && idSets.get(m.id)!.has(id))
      .map((m) => ({
        id: m.id,
        avail: Math.max(0, (m.counts[id] ?? 0) - 1) - (reservedSpares[m.id]?.[id] ?? 0),
      }))
      .filter((s) => s.avail > 0)
      .sort((a, b) => b.avail - a.avail); // most spares first; stable keeps member order on ties
    for (const s of sources) {
      if (remaining <= 0) break;
      const take = Math.min(s.avail, remaining);
      addWrite(writes, s.id, id, -take);
      remaining -= take;
    }
    if (remaining > 0) short[id] = remaining;
  }
  return { writes, short };
}
