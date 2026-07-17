import type { Counts } from '../types';

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
