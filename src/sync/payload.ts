// Type-only import (erased at build) keeps this module free of the store's
// runtime, so it stays importable in the plain-node Vitest env.
import type { AlbumSnapshot } from '../store/collectionStore';

/** Bump when the payload shape changes in a non-back-compatible way. */
export const PAYLOAD_V = 1;

/** One individually-shared album (its own Supabase row). */
export interface AlbumPayload {
  kind: 'album';
  v: number;
  access: 'collaborative' | 'read-only';
  /** Set by the owner to end the share; joiners see it and go Local (Stage 3). */
  sharingEndedAt?: number;
  album: AlbumSnapshot;
}

/** The whole-collection ("Cloud") row: every Cloud-mode album. */
export interface CollectionPayload {
  kind: 'collection';
  v: number;
  albums: AlbumSnapshot[];
  /** Monotonic set of deleted album ids (tombstones). Absence is NOT a delete. */
  deletedAlbumIds?: string[];
}

export type ChannelPayload = AlbumPayload | CollectionPayload;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function isAlbumPayload(p: unknown): p is AlbumPayload {
  return isObj(p) && p.kind === 'album' && isObj(p.album);
}

export function isCollectionPayload(p: unknown): p is CollectionPayload {
  return isObj(p) && p.kind === 'collection' && Array.isArray(p.albums);
}
