export type PageType = 'intro' | 'team' | 'extra';

/** Album edition. Differs only in the Coca-Cola page size (NA: 12, LATAM: 14). */
export type Edition = 'na' | 'latam';

export interface Sticker {
  /** Stable unique id, e.g. "FWC-00" or "MEX-1". */
  id: string;
  /** Display number as printed in the album, e.g. "00", "1", "20". */
  number: string;
  /** Owning page id. */
  pageId: string;
  /** Special / foil sticker (badges, intro highlights). */
  special: boolean;
}

export interface Page {
  /** Stable unique id, e.g. "FWC-trophy" or "MEX". */
  id: string;
  /** Short album code, e.g. "FWC", "MEX". Used by the text import parser. */
  code: string;
  /** Flag / section emoji shown next to the code. */
  emoji: string;
  /** Human title, e.g. "Mexico". */
  title: string;
  type: PageType;
  /**
   * Display only: when true, sticker numbers render code-prefixed (e.g. "CC1").
   * Sticker ids, list export and import always use the bare number.
   */
  prefixNumbers?: boolean;
  /** Sticker ids belonging to this page, in album order. */
  stickerIds: string[];
}

export interface Album {
  id: string;
  name: string;
  pages: Page[];
  stickers: Sticker[];
}

/** Count map: stickerId -> number owned. 0 = missing, 1 = owned, >1 = has swaps. */
export type Counts = Record<string, number>;

export type SwapStatus = 'open' | 'closed';

export interface Swap {
  id: string;
  name: string;
  /** Free-text notes about the swap (the other collector, meeting plans, etc.). */
  notes?: string;
  createdAt: number;
  closedAt?: number;
  status: SwapStatus;
  /** Parsed from the other collector's export. */
  theirNeeds: string[];
  theirSwaps: string[];
  /**
   * Copies the other collector needs per sticker id (their "(×N)" quantities),
   * for the ids in `theirNeeds`. Absent/1 means a single copy. Kept so editing a
   * swap can re-offer the right number of copies without re-typing the list.
   */
  theirNeedsQty?: Record<string, number>;
  /** Promised sticker ids in each direction. */
  giving: string[];
  receiving: string[];
  /**
   * Copies promised to give per sticker id, for the ids in `giving`. A collector
   * can need — and you can hand over — more than one copy of the same sticker.
   * Absent, or any id missing/≤1, means a single copy (back-compat with swaps
   * created before multi-copy giving). `receiving` is always one copy per id (you
   * only ever miss a sticker once), so it needs no quantity map.
   */
  givingQty?: Record<string, number>;
  /**
   * Ids the user has unselected in the detail modal — still part of the swap but
   * parked out of the active trade. Absent/empty means everything is selected.
   */
  deselectedGiving?: string[];
  deselectedReceiving?: string[];
  /**
   * Net count change closeSwap applied at settlement, per sticker id
   * (given -1, received +1; floored gives are omitted). Used by
   * rollbackSwap to reverse the close exactly. Absent on swaps closed
   * before this field existed.
   */
  settledDelta?: Record<string, number>;
}
