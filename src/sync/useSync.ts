import { useEffect } from 'react';
import { isSyncConfigured } from '../lib/supabase';
import { useSyncMeta } from '../store/syncStore';
import { startEngine, stopEngine } from './engine';

/**
 * Boot the sync engine for the app's lifetime. Call once (from App). Starts the
 * engine when a link exists and configured, restarts it if the link changes,
 * and stops it on unlink/unmount. No-op when sync isn't configured.
 */
export function useSyncBoot() {
  const codeHash = useSyncMeta((s) => s.codeHash);
  useEffect(() => {
    if (!isSyncConfigured || !codeHash) return;
    startEngine();
    return () => stopEngine();
  }, [codeHash]);
}
