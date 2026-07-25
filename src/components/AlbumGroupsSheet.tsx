import { useMemo, useState } from 'react';
import type { AlbumSnapshot } from '../store/collectionStore';
import { useCollection, orderAlbums } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { forcedReadOnly, MODE_BADGE } from '../sync/albumMode';
import { useAlbumMode, useResolvedAlbumName } from '../sync/useAlbumMode';
import { computeStatsFor, displayPct } from '../utils/stats';
import { monogram, coverTint } from '../utils/albumCover';
import type { AlbumGroup } from '../types';

interface Props {
  onClose: () => void;
}

/**
 * Manage album groups (§E): list existing groups, create/edit one by naming it and
 * picking members, or disband it. The picker offers every album; a read-only joined
 * share can only join as a view-only member (badged), and a group needs ≥2 WRITABLE
 * members to run a combined swap — so Save is gated on that.
 */
export default function AlbumGroupsSheet({ onClose }: Props) {
  const albums = useCollection((s) => s.albums);
  const albumOrder = useCollection((s) => s.albumOrder);
  const groups = useCollection((s) => s.groups);
  const createGroup = useCollection((s) => s.createGroup);
  const renameGroup = useCollection((s) => s.renameGroup);
  const setGroupMembers = useCollection((s) => s.setGroupMembers);
  const disbandGroup = useCollection((s) => s.disbandGroup);
  const albumLinks = useSyncMeta((s) => s.albumLinks);

  // 'list' shows existing groups; 'form' creates (editingId null) or edits one.
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDisband, setConfirmDisband] = useState<string | null>(null);

  const ordered = useMemo(() => orderAlbums(albums, albumOrder), [albums, albumOrder]);
  const writableCount = [...selected].filter((id) => !forcedReadOnly(albumLinks[id])).length;

  function startCreate() {
    setEditingId(null);
    setName('');
    setSelected(new Set());
    setView('form');
  }

  function startEdit(g: AlbumGroup) {
    setEditingId(g.id);
    setName(g.name);
    setSelected(new Set(g.memberIds));
    setView('form');
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    const ids = [...selected];
    if (editingId) {
      renameGroup(editingId, name);
      setGroupMembers(editingId, ids);
    } else {
      createGroup(name, ids);
    }
    setView('list');
  }

  // The other group (if any) each album already belongs to — an album is in at most one.
  const groupOfAlbum = (id: string): AlbumGroup | undefined =>
    groups.find((g) => g.id !== editingId && g.memberIds.includes(id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {view === 'list' ? (
          <>
            <h2>👥 Groups</h2>
            <p className="modal-sub">
              Work two or more albums as one pool for swapping. Combined swaps route each sticker to
              the album that needs it.
            </p>

            {groups.length === 0 ? (
              <p className="empty-state">No groups yet. Create one to swap albums together.</p>
            ) : (
              <div className="album-list">
                {groups.map((g) => (
                  <div className="group-row" key={g.id}>
                    <div className="group-row-main">
                      <span className="album-card-name">{g.name}</span>
                      <span className="album-card-meta">
                        {g.memberIds.length} member{g.memberIds.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button type="button" className="btn" onClick={() => startEdit(g)}>Edit</button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => setConfirmDisband(g.id)}
                    >
                      Disband
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary full" onClick={startCreate}>
                ➕ New group
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn full" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h2>{editingId ? 'Edit group' : 'New group'}</h2>
            <div className="settings-field">
              <label htmlFor="group-name" className="settings-field-label">Group name</label>
              <input
                id="group-name"
                type="text"
                className="settings-input"
                placeholder="e.g. Kids’ World Cup"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <p className="settings-field-label" style={{ marginTop: 4 }}>Members</p>
            <div className="album-list">
              {ordered.map((a) => (
                <MemberPickRow
                  key={a.id}
                  album={a}
                  selected={selected.has(a.id)}
                  inGroupName={groupOfAlbum(a.id)?.name}
                  onToggle={() => toggle(a.id)}
                />
              ))}
            </div>
            {writableCount < 2 && (
              <p className="reserved-note">Pick at least 2 editable albums to run combined swaps.</p>
            )}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn full" onClick={() => setView('list')}>Cancel</button>
              <button
                type="button"
                className="btn primary full"
                disabled={writableCount < 2 || name.trim().length === 0}
                onClick={save}
              >
                {editingId ? 'Save group' : 'Create group'}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmDisband && (
        <div className="modal-backdrop" onClick={() => setConfirmDisband(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Disband group?</h2>
            <p className="modal-sub">
              This removes the group and its combined swaps. Your albums and their own swaps are not
              touched.
            </p>
            <div className="btn-row">
              <button type="button" className="btn full" onClick={() => setConfirmDisband(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger full"
                onClick={() => { disbandGroup(confirmDisband); setConfirmDisband(null); }}
              >
                Disband
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  album: AlbumSnapshot;
  selected: boolean;
  /** Name of the OTHER group this album already belongs to, if any (blocks selection). */
  inGroupName?: string;
  onToggle: () => void;
}

/** One selectable album in the member picker. Hooks live here (Rules of Hooks — not in a map). */
function MemberPickRow({ album, selected, inGroupName, onToggle }: RowProps) {
  const name = useResolvedAlbumName(album.id, album.albumName);
  const mode = useAlbumMode(album.id);
  const link = useSyncMeta((s) => s.albumLinks[album.id]);
  const stats = useMemo(
    () => computeStatsFor(album.counts, album.edition, album.trackCC),
    [album.counts, album.edition, album.trackCC],
  );
  const readOnly = forcedReadOnly(link);
  const badge = MODE_BADGE[mode];
  const pct = displayPct(stats.completionPct);
  const blocked = inGroupName != null;

  return (
    <button
      type="button"
      className={`album-card group-pick${selected ? ' active' : ''}`}
      aria-pressed={selected}
      disabled={blocked}
      onClick={onToggle}
    >
      <span className="group-pick-check" aria-hidden="true">{selected ? '☑' : '☐'}</span>
      <span className={`album-cover tint-${coverTint(album.id)}`} aria-hidden="true">{monogram(name)}</span>
      <span className="album-card-body">
        <span className="album-card-top">
          <span className="album-card-name">{name}</span>
          {readOnly ? (
            <span className="group-member-badge">view-only</span>
          ) : (
            <span className={`album-card-badge mode-pill mode-${mode}`}>{badge.icon} {badge.label}</span>
          )}
        </span>
        <span className="album-card-meta">
          {stats.ownedUnique}/{stats.totalStickers} · {pct}%
          {blocked && <span className="album-card-current"> · in {inGroupName}</span>}
        </span>
      </span>
    </button>
  );
}
