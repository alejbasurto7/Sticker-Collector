import type { Counts, Edition } from '../types';
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
