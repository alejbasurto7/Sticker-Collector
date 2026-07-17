import { useEffect } from 'react';
import { isSyncConfigured } from '../lib/supabase';
import { useSyncMeta } from '../store/syncStore';
import { startEngine, stopEngine } from './engine';

/** Boot the sync engine for the app's lifetime. Restarts when the set of active channels changes. */
export function useSyncBoot() {
  const hasCollection = useSyncMeta((s) => s.collection !== null);
  const albumLinkKey = useSyncMeta((s) => Object.keys(s.albumLinks).sort().join(','));
  useEffect(() => {
    if (!isSyncConfigured || (!hasCollection && !albumLinkKey)) return;
    startEngine();
    return () => stopEngine();
  }, [hasCollection, albumLinkKey]);
}
