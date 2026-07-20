import { useState, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCollection, orderAlbums } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import AlbumCard from './AlbumCard';
import { isSyncConfigured } from '../lib/supabase';
import JoinAlbumDialog from './JoinAlbumDialog';

interface Props {
  onClose: () => void;
  onManageAlbum: (id: string) => void; // App switches + opens the album detail
  onOpenCloudSync: () => void;         // manage the whole-collection Cloud link (only if one exists)
}

export default function LibrarySheet({ onClose, onManageAlbum, onOpenCloudSync }: Props) {
  const albums = useCollection((s) => s.albums);
  const albumOrder = useCollection((s) => s.albumOrder);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const createAlbum = useCollection((s) => s.createAlbum);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  const reorderAlbums = useCollection((s) => s.reorderAlbums);
  // A whole-collection Cloud link only exists once the user has set up Cloud sync
  // (via a per-album Sharing → Cloud). Until then there's nothing to manage here.
  const hasCloudLink = useSyncMeta((s) => s.collection !== null);

  // New-album naming step, and a short confirmation after it lands in the list.
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Drag-to-reorder state. `dragId` is the album being dragged (null = idle);
  // `liveIds` is the provisional order shown while dragging (committed on release).
  const [dragId, setDragId] = useState<string | null>(null);
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => orderAlbums(albums, albumOrder), [albums, albumOrder]);
  const byId = useMemo(() => new Map(albums.map((a) => [a.id, a])), [albums]);
  // While dragging, render the provisional order; otherwise the stored order.
  const renderAlbums = (liveIds ?? ordered.map((a) => a.id))
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => a != null);
  const sortable = renderAlbums.length > 1;

  function open(id: string) {
    switchAlbum(id);
    onClose();
  }

  function confirmCreate() {
    createAlbum(); // creates AND makes the new album active
    const trimmed = draft.trim();
    if (trimmed) setAlbumName(trimmed); // override the auto-generated default
    setNaming(false);
    // Stay in the sheet so the new album is visibly added to the list (marked
    // "Current"); confirm it by name so the user knows it was created.
    setJustCreated(trimmed || 'New album');
  }

  // --- Pointer drag (touch + mouse), reorder-on-cross ---
  function handleGripPointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId); // keep receiving moves off the handle
    setDragId(id);
    setLiveIds(ordered.map((a) => a.id));
  }

  function handleGripPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragId || !listRef.current) return;
    const cards = Array.from(listRef.current.querySelectorAll<HTMLElement>('.album-card'));
    const y = e.clientY;
    // Insert-before slot = first card whose vertical midpoint is below the pointer;
    // cards.length means "below every card" → append at the end.
    let target = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = i; break; }
    }
    setLiveIds((prev) => {
      if (!prev) return prev;
      const from = prev.indexOf(dragId);
      if (from === -1) return prev;
      // `target` indexes the list WITH the dragged card still in it. Removing that
      // card shifts every later slot down one, so when inserting past the original
      // position the index drops by one.
      const insertAt = target > from ? target - 1 : target;
      if (insertAt === from) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(insertAt, 0, dragId);
      return next;
    });
  }

  function handleGripPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragId) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (liveIds) reorderAlbums(liveIds); // commit the provisional order
    setDragId(null);
    setLiveIds(null);
  }

  // --- Keyboard reorder: ArrowUp/Down moves the focused album one slot ---
  function handleGripKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); // don't scroll the modal
    const ids = ordered.map((a) => a.id);
    const from = ids.indexOf(id);
    const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    reorderAlbums(next);
    const label = byId.get(id)?.albumName ?? 'Album';
    setAnnounce(`Moved ${label} to position ${to + 1} of ${ids.length}.`);
    // React keeps this grip's DOM node (key = album id), so focus stays put.
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your albums</h2>

        {justCreated && (
          <p className="library-created" role="status">
            ✓ “{justCreated}” created — it’s in your list below.
          </p>
        )}

        <div className="album-list" ref={listRef}>
          {renderAlbums.map((a) => (
            <AlbumCard
              key={a.id}
              album={a}
              isActive={a.id === activeAlbumId}
              sortable={sortable}
              isDragging={dragId === a.id}
              onOpen={() => open(a.id)}
              onManage={() => onManageAlbum(a.id)}
              onGripPointerDown={(e) => handleGripPointerDown(e, a.id)}
              onGripPointerMove={handleGripPointerMove}
              onGripPointerUp={handleGripPointerUp}
              onGripKeyDown={(e) => handleGripKeyDown(e, a.id)}
            />
          ))}
        </div>
        <div className="sr-only" aria-live="polite">{announce}</div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn primary full"
            onClick={() => { setDraft(''); setJustCreated(null); setNaming(true); }}
          >
            ➕ New album
          </button>
          {isSyncConfigured && (
            <button
              type="button"
              className="btn full"
              onClick={() => { setJustCreated(null); setJoining(true); }}
            >
              📥 Join a shared album
            </button>
          )}
        </div>
        {hasCloudLink && (
          <button type="button" className="btn full" style={{ marginTop: 8 }} onClick={onOpenCloudSync}>
            ☁️ Cloud sync
          </button>
        )}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>

      {naming && (
        <div className="modal-backdrop" onClick={() => setNaming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New album</h2>
            <p className="modal-sub">Give your new album a name. You can change it later from its settings.</p>
            <div className="settings-field">
              <label htmlFor="new-album-name" className="settings-field-label">Album name</label>
              <input
                id="new-album-name"
                type="text"
                className="settings-input"
                placeholder="e.g. Leo’s album"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmCreate(); }}
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn full" onClick={() => setNaming(false)}>Cancel</button>
              <button type="button" className="btn primary full" onClick={confirmCreate}>Create album</button>
            </div>
          </div>
        </div>
      )}

      {joining && (
        <JoinAlbumDialog
          onClose={() => setJoining(false)}
          onJoined={() => { setJoining(false); onClose(); }}
        />
      )}
    </div>
  );
}
