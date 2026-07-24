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
