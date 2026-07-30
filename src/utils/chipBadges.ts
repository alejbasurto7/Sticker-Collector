import type { ChipRouting } from './groupSwap';

/** The fields AlbumMark needs to draw one album. */
export interface AlbumMarkInfo {
  id: string;
  name: string;
  viewOnly?: boolean;
}

/** One chip's routing, resolved to renderable albums. */
export interface ChipBadge {
  direction: 'give' | 'get';
  /** Albums this copy leaves from / lands in. */
  marks: AlbumMarkInfo[];
  /** More albums need it than copies are coming — the user picks at close. */
  ambiguous: boolean;
  /** View-only members needing it: handed over physically, never written. */
  handoffs: AlbumMarkInfo[];
  /** View-only members needing it that no copy reaches — still waiting after this swap. */
  waiting: AlbumMarkInfo[];
}

/**
 * Resolve ChipRouting member ids into marks. Keeps StickerChips to a single new
 * prop by doing the id → album lookup before it reaches the component.
 */
export function chipBadges(
  routing: Record<string, ChipRouting>,
  members: AlbumMarkInfo[],
  direction: 'give' | 'get',
): Map<string, ChipBadge> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const resolve = (ids: string[] = []) =>
    ids.map((id) => byId.get(id)).filter((m): m is AlbumMarkInfo => !!m);

  const out = new Map<string, ChipBadge>();
  for (const [id, r] of Object.entries(routing)) {
    out.set(id, {
      direction,
      marks: resolve(r.memberIds),
      ambiguous: !!r.ambiguousAmong?.length,
      handoffs: resolve(r.handoffIds),
      waiting: resolve(r.waitingIds),
    });
  }
  return out;
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Screen-reader sentence for a badged chip — colour is never the only signal. */
export function describeBadge(badge: ChipBadge, qty: number): string {
  const copies = `${qty} cop${qty === 1 ? 'y' : 'ies'}`;
  const names = badge.marks.map((m) => m.name);
  const handNames = badge.handoffs.map((m) => m.name);
  const waitNames = badge.waiting.map((m) => m.name);

  let core: string;
  if (names.length) {
    core = badge.direction === 'give' ? `from ${list(names)}` : `to ${list(names)}`;
    if (handNames.length) core += ` — also hand one to ${list(handNames)}`;
  } else if (handNames.length) {
    core = `for ${list(handNames)} — hand over, not recorded`;
  } else {
    core = 'not routed to an album';
  }
  // Named, not just counted: "one other" tells the user nothing about who to chase next.
  if (waitNames.length) {
    core += ` — ${list(waitNames)} still need${waitNames.length === 1 ? 's' : ''} one`;
  }

  return `${copies}, ${core}${badge.ambiguous ? ' — another album needs it too, you choose at close' : ''}`;
}
