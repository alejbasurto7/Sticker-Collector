import type { Counts, Swap } from '../types';

/**
 * 3-way merge of a counts map. A sticker only one side changed keeps that
 * side's value; a sticker both sides changed differently resolves to the max
 * (bias toward not losing owned/spares) — deterministic and order-independent,
 * so all devices converge. Zero results are omitted (absent === 0 === missing).
 */
export function mergeCounts(base: Counts, local: Counts, remote: Counts): Counts {
  const ids = new Set<string>([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  const out: Counts = {};
  for (const id of ids) {
    const b = base[id] ?? 0;
    const l = local[id] ?? 0;
    const r = remote[id] ?? 0;
    let v: number;
    if (l === r) v = l;
    else if (l === b) v = r;
    else if (r === b) v = l;
    else v = Math.max(l, r);
    if (v > 0) out[id] = v;
  }
  return out;
}

/**
 * 3-way merge of a single scalar. The side that differs from the common
 * ancestor wins; if both differ, a fixed comparator on the values picks the
 * winner (`>=` is lexical for strings, numeric for booleans) so every device
 * agrees. `base === undefined` means no common ancestor (e.g. first join).
 */
export function scalar3<T extends string | number | boolean>(
  base: T | undefined,
  local: T,
  remote: T,
): T {
  if (local === remote) return local;
  if (base !== undefined) {
    if (local === base) return remote;
    if (remote === base) return local;
  }
  return local >= remote ? local : remote;
}

/** Structural equality for plain JSON-ish values (swaps: scalars, arrays, records). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    return [...keys].every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

/** Canonical JSON with recursively sorted keys, so two devices serialize an
 *  equal value to an identical string (used only for a deterministic tie-break). */
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = canonicalize(o[k]);
    return out;
  }
  return v;
}

/** Deterministic winner of a same-id edit-vs-edit collision: later close/create
 *  time wins; on a tie, a stable content order that is identical on every device. */
function laterSwap(a: Swap, b: Swap): Swap {
  const at = a.closedAt ?? a.createdAt;
  const bt = b.closedAt ?? b.createdAt;
  if (at !== bt) return at > bt ? a : b;
  return JSON.stringify(canonicalize(a)) <= JSON.stringify(canonicalize(b)) ? a : b;
}

/**
 * 3-way merge of swap lists, keyed by id. A swap added on one side survives; an
 * edit on one side survives; a delete (in base, gone from one side, unchanged on
 * the other) is honored; an edit racing a delete keeps the edit; two conflicting
 * edits resolve via {@link laterSwap}. Output is sorted newest-first, id-stable.
 */
export function mergeSwaps(base: Swap[], local: Swap[], remote: Swap[]): Swap[] {
  const byId = (arr: Swap[]) => new Map(arr.map((s) => [s.id, s]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  const ids = new Set<string>([...l.keys(), ...r.keys()]);
  const out: Swap[] = [];
  for (const id of ids) {
    const bs = b.get(id);
    const ls = l.get(id);
    const rs = r.get(id);
    if (ls && rs) {
      if (deepEqual(ls, rs)) out.push(ls);
      else if (bs && deepEqual(ls, bs)) out.push(rs); // only remote edited
      else if (bs && deepEqual(rs, bs)) out.push(ls); // only local edited
      else out.push(laterSwap(ls, rs)); // both edited (or both new & differ) -- commutative tie-break
    } else if (ls && !rs) {
      if (bs && deepEqual(ls, bs)) continue; // unchanged locally, remote deleted -> drop
      out.push(ls); // new locally, or edited-vs-delete -> keep
    } else if (!ls && rs) {
      if (bs && deepEqual(rs, bs)) continue; // unchanged remotely, local deleted -> drop
      out.push(rs);
    }
  }
  return out.sort((x, y) => y.createdAt - x.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
