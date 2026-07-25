import { useMemo } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { buildGroupMembers } from './groupMembers';
import type { ResolvedGroupMember } from './groupMembers';
import type { AlbumGroup } from '../types';

/** Resolve a group's members reactively for this device, or null if the group is unknown. */
export function useGroupMembers(
  groupId?: string,
): { group: AlbumGroup; members: ResolvedGroupMember[] } | null {
  const group = useCollection((s) => (groupId ? s.groups.find((g) => g.id === groupId) : undefined));
  const parked = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const counts = useCollection((s) => s.counts);
  const edition = useCollection((s) => s.edition);
  const trackCC = useCollection((s) => s.trackCC);
  const albumName = useCollection((s) => s.albumName);
  const swaps = useCollection((s) => s.swaps);
  const albumLinks = useSyncMeta((s) => s.albumLinks);
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);

  return useMemo(() => {
    if (!group) return null;
    const members = buildGroupMembers(
      group.memberIds,
      parked,
      { id: activeAlbumId, counts, edition, trackCC, albumName, swaps },
      albumLinks,
      localAlbumNames,
    );
    return { group, members };
  }, [group, parked, activeAlbumId, counts, edition, trackCC, albumName, swaps, albumLinks, localAlbumNames]);
}
