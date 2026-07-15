import { supabase } from '../lib/supabase';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { generateSyncCode, hashSyncCode, isValidSyncCode, formatSyncCode } from '../lib/syncCode';
import { pickSyncState, sanitizeRemote } from './serialize';

// --- module singletons -------------------------------------------------------

// True while we're writing a pulled remote snapshot into the store, so the store
// subscription doesn't treat that write as a local edit and echo it back.
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubStore: (() => void) | null = null;
let started = false;

const PUSH_DEBOUNCE_MS = 1500; // collapse bursts of edits into one push
const POLL_MS = 45_000; // gentle foreground poll (Realtime is deferred)

interface Row {
  code_hash: string;
  data: unknown;
  writer_id: string;
  version: number;
  updated_at: string;
}

/** The RPCs return either a single row object or a one-element array. */
function firstRow(data: unknown): Row | null {
  if (!data) return null;
  return (Array.isArray(data) ? data[0] : data) as Row | null;
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;
const offlineStatus = (): 'error' | 'offline' => (isOnline() ? 'error' : 'offline');
const newWriterId = () => crypto.randomUUID();

/**
 * Apply a server row to local state when it's genuinely newer AND not our own
 * echoed write, then record the version. Central to both pull and push paths.
 */
function handleRow(row: Row | null) {
  const meta = useSyncMeta.getState();
  if (!row) {
    meta.setStatus('synced');
    return;
  }
  if (row.writer_id !== meta.writerId && row.version > meta.lastVersion) {
    const clean = sanitizeRemote(row.data);
    if (clean) {
      applyingRemote = true;
      try {
        useCollection.getState().applyRemoteState(clean);
      } finally {
        applyingRemote = false;
      }
    }
  }
  meta.markSynced(row.version);
}

async function doPull() {
  if (!supabase) return;
  const { codeHash } = useSyncMeta.getState();
  if (!codeHash) return;
  try {
    const { data, error } = await supabase.rpc('sync_pull', { p_code_hash: codeHash });
    if (error) {
      useSyncMeta.getState().setStatus(offlineStatus());
      return;
    }
    handleRow(firstRow(data));
  } catch {
    useSyncMeta.getState().setStatus(offlineStatus());
  }
}

async function doPush() {
  if (!supabase) return;
  const meta = useSyncMeta.getState();
  if (!meta.codeHash) return;
  meta.setStatus('syncing');
  const payload = pickSyncState(useCollection.getState());
  try {
    const { data, error } = await supabase.rpc('sync_push', {
      p_code_hash: meta.codeHash,
      p_data: payload,
      p_writer: meta.writerId,
      p_base_version: meta.lastVersion,
    });
    if (error) {
      useSyncMeta.getState().setStatus(offlineStatus());
      return;
    }
    // On a lost optimistic-concurrency race the RPC returns the current server
    // truth (a newer writer's row); handleRow applies it (last-write-wins).
    handleRow(firstRow(data));
  } catch {
    useSyncMeta.getState().setStatus(offlineStatus());
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void doPush();
  }, PUSH_DEBOUNCE_MS);
}

function onFocusOrVisible() {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') void doPull();
}

function onOnline() {
  void doPush();
}

// --- lifecycle ---------------------------------------------------------------

/** Start syncing if configured and linked. Idempotent. */
export function startEngine() {
  if (!supabase || started) return;
  if (!useSyncMeta.getState().codeHash) return; // not linked yet
  started = true;

  unsubStore = useCollection.subscribe(() => {
    if (!applyingRemote) schedulePush();
  });
  window.addEventListener('focus', onFocusOrVisible);
  document.addEventListener('visibilitychange', onFocusOrVisible);
  window.addEventListener('online', onOnline);
  pollTimer = setInterval(() => {
    if (isOnline() && document.visibilityState === 'visible') void doPull();
  }, POLL_MS);

  void doPull(); // initial reconcile on start
}

/** Tear down all listeners/timers. Idempotent. */
export function stopEngine() {
  started = false;
  unsubStore?.();
  unsubStore = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  window.removeEventListener('focus', onFocusOrVisible);
  document.removeEventListener('visibilitychange', onFocusOrVisible);
  window.removeEventListener('online', onOnline);
}

// --- linking actions (used by the Sync UI) -----------------------------------

/** Create a brand-new sync link from THIS device's data. Returns the code to share. */
export async function createLink(): Promise<string> {
  const code = generateSyncCode();
  const codeHash = await hashSyncCode(code);
  useSyncMeta.getState().setLink({ code, codeHash, writerId: newWriterId() });
  await doPush(); // seed the cloud row (base version 0 → insert)
  startEngine();
  return code;
}

export type EnterResult = { ok: true } | { ok: false; reason: 'invalid' | 'not-found' | 'network' | 'unconfigured' };

/** Join an existing collection by its code, replacing this device's data with it. */
export async function enterLink(input: string): Promise<EnterResult> {
  if (!supabase) return { ok: false, reason: 'unconfigured' };
  if (!isValidSyncCode(input)) return { ok: false, reason: 'invalid' };
  const code = formatSyncCode(input);
  const codeHash = await hashSyncCode(code);
  const writerId = newWriterId();
  try {
    const { data, error } = await supabase.rpc('sync_pull', { p_code_hash: codeHash });
    if (error) return { ok: false, reason: 'network' };
    const row = firstRow(data);
    if (!row) return { ok: false, reason: 'not-found' };
    // Link first (lastVersion 0 so handleRow applies the pulled row), then apply.
    useSyncMeta.getState().setLink({ code, codeHash, writerId });
    handleRow(row);
    startEngine();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Stop syncing on this device. Local data is untouched. */
export function unlink() {
  stopEngine();
  useSyncMeta.getState().clearLink();
}
