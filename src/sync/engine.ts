import { supabase } from '../lib/supabase';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta, type SyncMetaState } from '../store/syncStore';
import { generateSyncCode, hashSyncCode, isValidSyncCode, formatSyncCode } from '../lib/syncCode';
import {
  hasCollectionData,
  sliceCloudPayload,
  sliceAlbumPayload,
  cloudManagedIds,
  allAlbums,
  normalizeRemote,
  type SliceState,
} from './serialize';
import { mergeAlbum, mergeCollection } from './merge';
import { PAYLOAD_V, type AlbumPayload, type CollectionPayload, type ChannelPayload } from './payload';

// --- channel model ------------------------------------------------------------

/** The whole-collection ("Cloud") channel: your own devices, always read-write. */
export interface CloudChannel {
  key: 'collection';
  kind: 'collection';
  codeHash: string;
  writerId: string;
  lastVersion: number;
  writable: true;
}

/** A single shared-album channel. `role`/`access` decide writability (see {@link isWritable}). */
export interface AlbumChannel {
  key: string; // === albumId
  kind: 'album';
  albumId: string;
  codeHash: string;
  writerId: string;
  lastVersion: number;
  role: 'owner' | 'joiner';
  access: 'collaborative' | 'read-only';
  writable: boolean;
}

export type Channel = CloudChannel | AlbumChannel;

/**
 * Can this device push to `channel`? The Cloud channel and any owner/collaborative
 * album channel are writable. The one exception is a **read-only joiner** channel:
 * pull-only (the owner's copy is authoritative). A **read-only owner** channel IS
 * writable — the owner's writes are authoritative and never merge in a joiner's.
 */
export function isWritable(channel: Channel): boolean {
  return channel.kind === 'collection' ? true : !(channel.role === 'joiner' && channel.access === 'read-only');
}

/** Album ids this device's Cloud channel manages: everything except shared/private albums. */
export function computeManagedIds(
  collectionState: SliceState,
  syncMeta: Pick<SyncMetaState, 'albumLinks' | 'privateAlbumIds'>,
): Set<string> {
  return cloudManagedIds(
    allAlbums(collectionState).map((a) => a.id),
    Object.keys(syncMeta.albumLinks),
    syncMeta.privateAlbumIds,
  );
}

function managedIds(): Set<string> {
  return computeManagedIds(useCollection.getState(), useSyncMeta.getState());
}

/** Shared-album + private album ids: the ones the Cloud channel must NOT touch. */
function nonCloudIds(): Set<string> {
  const meta = useSyncMeta.getState();
  return new Set([...Object.keys(meta.albumLinks), ...meta.privateAlbumIds]);
}

function emptyCollection(): CollectionPayload {
  return { kind: 'collection', v: PAYLOAD_V, albums: [] };
}

/** Build today's channel descriptors from `useSyncMeta`: the Cloud channel (if linked) + one per album link. */
function buildChannels(): Channel[] {
  const meta = useSyncMeta.getState();
  const channels: Channel[] = [];
  if (meta.collection) {
    channels.push({
      key: 'collection',
      kind: 'collection',
      codeHash: meta.collection.codeHash,
      writerId: meta.collection.writerId,
      lastVersion: meta.collection.lastVersion,
      writable: true,
    });
  }
  for (const link of Object.values(meta.albumLinks)) {
    channels.push({
      key: link.albumId,
      kind: 'album',
      albumId: link.albumId,
      codeHash: link.codeHash,
      writerId: link.writerId,
      lastVersion: link.lastVersion,
      role: link.role,
      access: link.access,
      writable: isWritable({ kind: 'album', role: link.role, access: link.access } as AlbumChannel),
    });
  }
  return channels;
}

function findChannel(key: string): Channel | undefined {
  return buildChannels().find((c) => c.key === key);
}

/** This device's current slice for `channel` (its Cloud-managed albums, or one album). */
function localSlice(channel: Channel): ChannelPayload | null {
  const state = useCollection.getState();
  if (channel.kind === 'collection') return sliceCloudPayload(state, managedIds());
  return sliceAlbumPayload(state, channel.albumId, channel.access);
}

/** This device's Cloud-channel slice, specifically (always defined — unlike a single album). */
function cloudLocalSlice(): CollectionPayload {
  return sliceCloudPayload(useCollection.getState(), managedIds());
}

/**
 * The last snapshot this device agreed on for `channel` (for the 3-way merge). Absent for a
 * brand-new album channel — `undefined` lets {@link mergeAlbum} take its "no common ancestor"
 * (first-join = union) path; the Cloud channel always has a concrete (possibly empty) base
 * because {@link mergeCollection}'s signature requires one.
 */
function baseFor(channel: Channel): ChannelPayload | undefined {
  const saved = useSyncMeta.getState().bases[channel.key];
  if (saved) return saved;
  return channel.kind === 'collection' ? emptyCollection() : undefined;
}

/**
 * The pure 3-way-merge decision for one channel. Cloud merges album-by-album, scoped to this
 * device's managed ids. An album channel merges normally UNLESS it's a **read-only owner**
 * channel, in which case the owner's local copy is authoritative and remote writes are never
 * merged in (a stray write elsewhere is transient: the owner's next push reasserts local).
 */
export function mergeFor(
  channel: Channel,
  base: ChannelPayload | undefined,
  local: ChannelPayload,
  remote: ChannelPayload | null,
): ChannelPayload {
  if (channel.kind === 'collection') {
    return mergeCollection(
      (base as CollectionPayload | undefined) ?? emptyCollection(),
      local as CollectionPayload,
      (remote as CollectionPayload | null) ?? emptyCollection(),
      managedIds(),
    );
  }
  if (channel.role === 'owner' && channel.access === 'read-only') {
    return local; // authoritative: never adopt a joiner's write
  }
  if (!remote) return local; // nothing to reconcile against yet
  const localAlbum = local as AlbumPayload;
  const remoteAlbum = remote as AlbumPayload;
  return {
    ...localAlbum,
    album: mergeAlbum((base as AlbumPayload | undefined)?.album, localAlbum.album, remoteAlbum.album),
  };
}

// --- module singletons -------------------------------------------------------

// True while we're writing a merged/pulled snapshot into the store, so the store
// subscription doesn't treat that write as a local edit and echo it back.
let applyingRemote = false;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubStore: (() => void) | null = null;
let started = false;

const PUSH_DEBOUNCE_MS = 1500; // collapse bursts of edits into one push
const POLL_MS = 45_000; // gentle foreground poll (Realtime is deferred)
const MAX_PUSH_RETRIES = 3; // bounded retries on a lost optimistic-concurrency race

interface Row {
  code_hash: string;
  data: unknown;
  writer_id: string;
  version: number;
  updated_at?: string;
}

/** The RPCs return either a single row object or a one-element array. */
function firstRow(data: unknown): Row | null {
  if (!data) return null;
  return (Array.isArray(data) ? data[0] : data) as Row | null;
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;
const offlineStatus = (): 'error' | 'offline' => (isOnline() ? 'error' : 'offline');
const newWriterId = () => crypto.randomUUID();

function applyMerged(channel: Channel, merged: ChannelPayload): void {
  applyingRemote = true;
  try {
    if (channel.kind === 'collection') {
      useCollection.getState().applyMergedCollection(merged as CollectionPayload, nonCloudIds());
    } else {
      useCollection.getState().applyMergedAlbum(channel.albumId, (merged as AlbumPayload).album);
    }
  } finally {
    applyingRemote = false;
  }
}

/**
 * Apply a pulled server row to this channel when it's genuinely newer AND not our own echoed
 * write. A read-only joiner adopts the owner's row directly (no local merge); every other
 * writable channel 3-way merges it. Always records the version when a row exists.
 *
 * Recording the merge result as the new `base` is only safe when it's a value the server is
 * KNOWN to actually hold. A pure pull (nothing local to contribute) yields `merged === remote`,
 * so it's safe to record directly. But if `local` had its own not-yet-pushed edits, the 3-way
 * merge folds them into `merged` too — and the server does NOT have those yet. Recording that
 * as `base` anyway would make the *next* push see our own pending contribution as something the
 * (still-stale) remote "deleted" (base would already have it, local unchanged, remote wouldn't
 * -> false deletion). So in that case we push instead, and the push's own success path is what
 * records the base once the server actually confirms it.
 */
function applyPulledRow(channel: Channel, row: Row | null): void {
  if (!row) {
    useSyncMeta.getState().setChannelStatus(channel.key, 'synced');
    return;
  }
  if (row.writer_id !== channel.writerId && row.version > channel.lastVersion) {
    const remote = normalizeRemote(row.data);
    if (remote) {
      const readOnlyJoiner = channel.kind === 'album' && channel.role === 'joiner' && channel.access === 'read-only';
      const local = localSlice(channel);
      const merged = readOnlyJoiner || !local ? remote : mergeFor(channel, baseFor(channel), local, remote);
      applyMerged(channel, merged);
      if (JSON.stringify(merged) === JSON.stringify(remote)) {
        useSyncMeta.getState().setBase(channel.key, merged); // nothing unconfirmed folded in -> safe
      } else if (isWritable(channel)) {
        schedulePush(channel.key); // confirm our folded-in contribution before recording it as base
      }
    }
  }
  useSyncMeta.getState().markChannelSynced(channel.key, row.version);
}

async function doPullChannel(key: string): Promise<void> {
  if (!supabase) return;
  const channel = findChannel(key);
  if (!channel) return;
  try {
    const { data, error } = await supabase.rpc('sync_pull', { p_code_hash: channel.codeHash });
    if (error) {
      useSyncMeta.getState().setChannelStatus(key, offlineStatus());
      return;
    }
    applyPulledRow(channel, firstRow(data));
  } catch {
    useSyncMeta.getState().setChannelStatus(key, offlineStatus());
  }
}

/**
 * Push this channel's local slice: pull current remote, merge, then write with an
 * optimistic-concurrency guard. A read-only-owner channel always pushes local as authoritative
 * (merge is a no-op there — see {@link mergeFor}). On a lost race (server returns another
 * writer's newer row) re-merge and retry, bounded by {@link MAX_PUSH_RETRIES}.
 */
async function doPushChannel(key: string, attempt = 0): Promise<void> {
  if (!supabase) return;
  const channel = findChannel(key);
  if (!channel || !isWritable(channel)) return;
  useSyncMeta.getState().setChannelStatus(key, 'syncing');
  const local = localSlice(channel);
  if (!local) return; // nothing local to push for this channel (e.g. album not present)

  try {
    const { data: pullData, error: pullError } = await supabase.rpc('sync_pull', { p_code_hash: channel.codeHash });
    if (pullError) {
      useSyncMeta.getState().setChannelStatus(key, offlineStatus());
      return;
    }
    const row = firstRow(pullData);
    // Always compute remote and route through mergeFor when a row exists — including our own
    // last-written row ("own echo", the common single-active-device case). Merging local against
    // its own last-written value is an idempotent no-op for everything EXCEPT tombstones, which
    // mergeCollection reconstructs from `base` (sliceCloudPayload/local never carries
    // deletedAlbumIds). A shortcut that special-cased own-echo to `merged = local` would silently
    // drop deletedAlbumIds from both the pushed row and the recorded base, resurrecting tombstoned
    // albums from another device later. We still never re-apply our own echoed write into the
    // store below when merged === local, so this only changes the merge/tombstone computation.
    const remote = row ? normalizeRemote(row.data) : null;
    const merged = remote ? mergeFor(channel, baseFor(channel), local, remote) : local;

    const { data: pushData, error: pushError } = await supabase.rpc('sync_push', {
      p_code_hash: channel.codeHash,
      p_data: merged,
      p_writer: channel.writerId,
      p_base_version: row?.version ?? channel.lastVersion,
    });
    if (pushError) {
      useSyncMeta.getState().setChannelStatus(key, offlineStatus());
      return;
    }

    const resultRow = firstRow(pushData);
    if (!resultRow) {
      useSyncMeta.getState().setChannelStatus(key, offlineStatus());
      return;
    }
    if (resultRow.writer_id === channel.writerId) {
      // Our write landed.
      useSyncMeta.getState().setBase(key, merged);
      if (JSON.stringify(merged) !== JSON.stringify(local)) applyMerged(channel, merged);
      useSyncMeta.getState().markChannelSynced(key, resultRow.version);
      return;
    }
    // Lost the optimistic-concurrency race: another writer's row is now current. Re-merge & retry.
    if (attempt < MAX_PUSH_RETRIES) {
      await doPushChannel(key, attempt + 1);
    } else {
      useSyncMeta.getState().setChannelStatus(key, offlineStatus());
    }
  } catch {
    useSyncMeta.getState().setChannelStatus(key, offlineStatus());
  }
}

function schedulePush(key: string): void {
  const existing = pushTimers.get(key);
  if (existing) clearTimeout(existing);
  pushTimers.set(
    key,
    setTimeout(() => {
      pushTimers.delete(key);
      void doPushChannel(key);
    }, PUSH_DEBOUNCE_MS),
  );
}

function clearPushTimers(): void {
  for (const t of pushTimers.values()) clearTimeout(t);
  pushTimers.clear();
}

function pullAll(): void {
  for (const ch of buildChannels()) void doPullChannel(ch.key);
}

function pushAllWritable(): void {
  for (const ch of buildChannels()) if (isWritable(ch)) schedulePush(ch.key);
}

function onFocusOrVisible(): void {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') pullAll();
}

function onOnline(): void {
  // Coming back online: catch up on remote changes AND flush anything edited while offline
  // (a debounced push made while offline fails once and does not self-retry).
  pullAll();
  pushAllWritable();
}

// --- lifecycle ---------------------------------------------------------------

/** Start syncing every active channel if configured and at least one is linked. Idempotent. */
export function startEngine(): void {
  if (!supabase || started) return;
  if (buildChannels().length === 0) return; // nothing linked
  started = true;

  unsubStore = useCollection.subscribe(() => {
    if (applyingRemote) return;
    pushAllWritable();
  });
  window.addEventListener('focus', onFocusOrVisible);
  document.addEventListener('visibilitychange', onFocusOrVisible);
  window.addEventListener('online', onOnline);
  pollTimer = setInterval(() => {
    if (isOnline() && document.visibilityState === 'visible') pullAll();
  }, POLL_MS);

  pullAll(); // initial reconcile on start
}

/** Tear down all listeners/timers. Idempotent. */
export function stopEngine(): void {
  started = false;
  unsubStore?.();
  unsubStore = null;
  clearPushTimers();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  window.removeEventListener('focus', onFocusOrVisible);
  document.removeEventListener('visibilitychange', onFocusOrVisible);
  window.removeEventListener('online', onOnline);
}

// --- linking actions (used by the Sync UI) -----------------------------------
// These target the Cloud channel specifically (key 'collection'); album-channel
// linking (create/join/leave/stop a share) is Stage 3 — the push/pull loop above
// already handles album channels generically once a link exists.

/** Create a brand-new Cloud link from THIS device's data. Returns the code to share. */
export async function createLink(): Promise<string> {
  const code = generateSyncCode();
  const codeHash = await hashSyncCode(code);
  useSyncMeta.getState().setCollectionLink({ code, codeHash, writerId: newWriterId() });
  await doPushChannel('collection'); // seed the cloud row (base version 0 -> insert)
  startEngine();
  return code;
}

/**
 * Does THIS device hold a collection worth protecting? Used to decide whether joining a code
 * can safely auto-merge (empty device) or should still warn the user (so we never silently
 * overwrite real data — the join-wipe bug). With merge3, joining always unions rather than
 * overwriting, but the UI still uses this to soften the messaging.
 */
function localHasData(): boolean {
  return hasCollectionData(useCollection.getState());
}

export interface PeekOk {
  ok: true;
  code: string;
  codeHash: string;
  remoteVersion: number;
  remoteData: unknown;
  /** True when this device already has a collection (a plain overwrite would have lost it). */
  localHasData: boolean;
}
export type PeekResult = PeekOk | { ok: false; reason: 'invalid' | 'not-found' | 'network' | 'unconfigured' };

/**
 * Look up a code's cloud collection WITHOUT changing anything locally. Nothing is linked or
 * overwritten here. `remoteData` is the validated/normalized `CollectionPayload` — a row that
 * fails validation, or is actually an album-share row (Stage 3 join flow, not this one), is
 * reported as not-found.
 */
export async function peekRemote(input: string): Promise<PeekResult> {
  if (!supabase) return { ok: false, reason: 'unconfigured' };
  if (!isValidSyncCode(input)) return { ok: false, reason: 'invalid' };
  const code = formatSyncCode(input);
  const codeHash = await hashSyncCode(code);
  try {
    const { data, error } = await supabase.rpc('sync_pull', { p_code_hash: codeHash });
    if (error) return { ok: false, reason: 'network' };
    const row = firstRow(data);
    if (!row) return { ok: false, reason: 'not-found' };
    const remote = normalizeRemote(row.data);
    if (!remote || remote.kind !== 'collection') return { ok: false, reason: 'not-found' };
    return {
      ok: true,
      code,
      codeHash,
      remoteVersion: row.version,
      remoteData: remote,
      localHasData: localHasData(),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Join a code, non-destructively merging the shared (cloud) collection into this device's. */
export function linkWithRemote(peek: PeekOk): void {
  useSyncMeta.getState().setCollectionLink({ code: peek.code, codeHash: peek.codeHash, writerId: newWriterId() });
  const channel = findChannel('collection')!; // just linked above
  const remote = peek.remoteData as CollectionPayload;
  const local = cloudLocalSlice();
  // No saved base yet -> first-join union (see mergeCollection/mergeAlbum "no common ancestor").
  const merged = mergeFor(channel, undefined, local, remote);
  applyMerged(channel, merged); // immediate UI feedback with the unioned collection
  // Deliberately do NOT setBase/markChannelSynced here with the merged result: it hasn't
  // been confirmed by the server yet, and recording it as the "agreed" base before that would
  // make the next merge see our own not-yet-pushed contribution as something remote "deleted"
  // (base would already contain it, remote wouldn't yet, local unchanged -> false deletion).
  // Push it for real instead — doPushChannel re-derives the same union against a fresh pull
  // (base still empty at that point) and only records the base once the push is confirmed.
  void doPushChannel('collection');
  startEngine();
}

/**
 * Join a code, pushing this device's collection up merged with the shared one (so the other
 * device receives the union too). Used when this device wants its edits reflected immediately
 * rather than waiting for the next reconcile.
 */
export async function linkWithLocal(peek: PeekOk): Promise<void> {
  useSyncMeta.getState().setCollectionLink({ code: peek.code, codeHash: peek.codeHash, writerId: newWriterId() });
  // Base our push on the remote's current version so the optimistic-concurrency update succeeds.
  useSyncMeta.getState().markChannelSynced('collection', peek.remoteVersion);
  await doPushChannel('collection');
  startEngine();
}

/** Stop syncing the Cloud channel on this device. Local data is untouched. */
export function unlink(): void {
  stopEngine();
  useSyncMeta.getState().clearCollectionLink();
  // Album links, if any, are left intact (Stage 3 manages them) — resume the engine in case any
  // remain active. A no-op today (Stage 2 has no album links), harmless once Stage 3 adds them.
  startEngine();
}
