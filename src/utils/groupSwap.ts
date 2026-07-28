import type { Counts, Edition, Swap } from '../types';
import type { ParsedList } from './import';
import type { Reservations } from './swap';
import { computeReservations, giveQtyOf } from './swap';
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
    const viewNeeders = includers.filter((m) => !m.writable && (m.counts[id] ?? 0) === 0);

    // Writable needers first — a view-only need never consumes a writable album's target.
    const assign = Math.min(writableNeeders.length, qty);
    for (let k = 0; k < assign; k++) addWrite(writes, writableNeeders[k].id, id, 1);
    let remaining = qty - assign;

    // Each view-only needer takes one PHYSICAL copy. It is never written to counts, but it
    // is still consumed — so it cannot also be parked in a writable album as a spare.
    const handedOff = Math.min(viewNeeders.length, remaining);
    for (let k = 0; k < handedOff; k++) {
      handoffs.push({ id, memberId: viewNeeders[k].id, memberName: viewNeeders[k].name });
    }
    remaining -= handedOff;

    // Only a genuine surplus — beyond every needer, writable or view-only — becomes a spare.
    if (remaining > 0) {
      const target = includers.find((m) => m.writable);
      if (target) addWrite(writes, target.id, id, remaining);
    }

    if (writableNeeders.length > qty && writableNeeders.length > 1) {
      ambiguous.push({
        id,
        chosenIds: writableNeeders.slice(0, qty).map((m) => m.id),
        options: writableNeeders.map((m) => ({ id: m.id, name: m.name })),
      });
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

/** Where one sticker's copies come from / go to, for display only. Never persisted. */
export interface ChipRouting {
  /** Distinct member ids this sticker leaves from (give) or lands in (get), in group order. */
  memberIds: string[];
  /** Set when more writable albums need it than copies are coming — user picks at close. */
  ambiguousAmong?: string[];
  /** View-only members missing it: a physical hand-off, never written to counts. */
  handoffIds?: string[];
}

export interface DisplayRouting {
  give: Record<string, ChipRouting>;
  get: Record<string, ChipRouting>;
}

/**
 * Flatten routeGiven / routeReceived into per-sticker display data. Adds no routing
 * logic of its own so the badges can never disagree with settlement.
 *
 * One mark per DISTINCT member: quantity is already carried by the chip's ×N badge, so
 * an album supplying both copies gets one mark, not two.
 */
export function routeForDisplay(
  members: GroupMember[],
  giving: Record<string, number>,
  receiving: Record<string, number>,
  reservedSpares: Record<string, Record<string, number>> = {},
): DisplayRouting {
  const order = new Map(members.map((m, i) => [m.id, i]));
  // writes is keyed by album id in insertion order; re-sort so marks follow group order.
  const inOrder = (ids: string[]) => [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  const given = routeGiven(members, giving, reservedSpares);
  const received = routeReceived(members, receiving);

  const give: Record<string, ChipRouting> = {};
  for (const id of Object.keys(giving)) {
    give[id] = {
      memberIds: inOrder(Object.keys(given.writes).filter((aid) => (given.writes[aid][id] ?? 0) < 0)),
    };
  }

  const get: Record<string, ChipRouting> = {};
  for (const id of Object.keys(receiving)) {
    const amb = received.ambiguous.find((a) => a.id === id);
    const handoffIds = received.handoffs.filter((h) => h.id === id).map((h) => h.memberId);
    get[id] = {
      memberIds: inOrder(Object.keys(received.writes).filter((aid) => (received.writes[aid][id] ?? 0) > 0)),
      ...(amb ? { ambiguousAmong: inOrder(amb.options.map((o) => o.id)) } : {}),
      ...(handoffIds.length ? { handoffIds: inOrder(handoffIds) } : {}),
    };
  }

  return { give, get };
}

/** Each member's own solo-swap give reservations, so the per-album give floor holds. */
export function reservedSparesOf(
  members: { id: string; swaps: Swap[] }[],
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    members.map((m) => [m.id, Object.fromEntries(computeReservations(m.swaps).committedGive)]),
  );
}

/**
 * The promised copies on a swap, as routeForDisplay wants them. Deliberately the
 * PROMISED set, not the checked set: routing is per-sticker independent, so this keeps
 * an unchecked chip's marks from blanking out and jumping back when it is re-checked.
 */
export function swapRoutingInput(swap: Swap): {
  giving: Record<string, number>;
  receiving: Record<string, number>;
} {
  const giving: Record<string, number> = {};
  for (const id of swap.giving) giving[id] = giveQtyOf(swap, id);
  const receiving: Record<string, number> = {};
  for (const id of swap.receiving) receiving[id] = Math.max(1, swap.receivingQty?.[id] ?? 1);
  return { giving, receiving };
}
