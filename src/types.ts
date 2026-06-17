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
  createdAt: number;
  closedAt?: number;
  status: SwapStatus;
  /** Parsed from the other collector's export. */
  theirNeeds: string[];
  theirSwaps: string[];
  /** Promised sticker ids in each direction. */
  giving: string[];
  receiving: string[];
  /**
   * Ids the user has unselected in the detail modal — still part of the swap but
   * parked out of the active trade. Absent/empty means everything is selected.
   */
  deselectedGiving?: string[];
  deselectedReceiving?: string[];
}
