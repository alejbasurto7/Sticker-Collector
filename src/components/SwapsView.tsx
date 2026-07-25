import { useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { useForcedReadOnly } from '../sync/useAlbumMode';
import { useGroupMembers } from '../sync/useGroupMembers';
import { groupForAlbum } from '../sync/groupMembers';
import type { GroupSwapCtx } from '../sync/groupMembers';
import { activeReceiving, computeConflicts, totalGiving } from '../utils/swap';
import { computeGroupPool } from '../utils/groupSwap';
import { buildGroupListExport } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';
import type { Swap } from '../types';
import { tapVerb } from '../utils/device';
import NewSwapDialog from './NewSwapDialog';
import SwapDetail from './SwapDetail';
import InternalMovesPanel from './InternalMovesPanel';

export default function SwapsView() {
  const swaps = useCollection((s) => s.swaps);
  const counts = useCollection((s) => s.counts);
  const albumName = useCollection((s) => s.albumName);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const groups = useCollection((s) => s.groups);
  const applyInternalMove = useCollection((s) => s.applyInternalMove);
  const readOnly = useForcedReadOnly();

  const [creating, setCreating] = useState(false);
  const [openSwap, setOpenSwap] = useState<Swap | null>(null);
  const [lens, setLens] = useState<'album' | 'group'>('album');
  const [copiedList, setCopiedList] = useState(false);

  // Resolve the group this album belongs to (if any) for this device.
  const group = groupForAlbum(groups, activeAlbumId);
  const gm = useGroupMembers(group?.id);
  const pool = useMemo(() => (gm ? computeGroupPool(gm.members) : null), [gm]);
  // The lens is offered only from a writable member of a group with ≥2 resolvable members.
  const canLens = !readOnly && !!gm && gm.members.length >= 2;
  const showGroup = canLens && lens === 'group';
  const combinedCtx: GroupSwapCtx | undefined = gm ? { groupId: gm.group.id, members: gm.members } : undefined;

  const conflicts = useMemo(() => computeConflicts(swaps, counts), [swaps, counts]);
  const swapConflictCount = (s: Swap) => {
    if (s.status !== 'open') return 0;
    let n = 0;
    for (const id of s.giving) if (conflicts.giving.has(id)) n++;
    for (const id of s.receiving) if (conflicts.receiving.has(id)) n++;
    return n;
  };

  // The swaps shown depend on the active lens: the album's own, or the group's combined.
  const listSwaps = showGroup && gm ? gm.group.swaps : swaps;
  const open = listSwaps.filter((s) => s.status === 'open');
  const closed = listSwaps.filter((s) => s.status === 'closed');
  // Re-read the live swap object so the detail modal reflects edits.
  const liveOpenSwap = openSwap ? listSwaps.find((s) => s.id === openSwap.id) ?? null : null;

  const shareCombined = async () => {
    if (!pool || !gm) return;
    const ok = await copyToClipboard(buildGroupListExport(pool, gm.group.name));
    if (!ok) return;
    setCopiedList(true);
    window.setTimeout(() => setCopiedList(false), 1500);
  };

  return (
    <div>
      {canLens && gm && (
        <span className="mini-seg lens-seg" role="group" aria-label="Swap scope">
          <button
            type="button"
            className={lens === 'album' ? 'on' : ''}
            aria-pressed={lens === 'album'}
            onClick={() => setLens('album')}
          >
            {albumName}
          </button>
          <button
            type="button"
            className={lens === 'group' ? 'on' : ''}
            aria-pressed={lens === 'group'}
            onClick={() => setLens('group')}
          >
            {gm.group.name} (both)
          </button>
        </span>
      )}

      <div className="toolbar">
        {readOnly ? (
          <span className="sync-chip sync-synced" title="Read-only shared album">
            🔒 Read-only — shared by code owner
          </span>
        ) : showGroup ? (
          <>
            <button className="btn primary" onClick={() => setCreating(true)}>
              ＋ New combined swap
            </button>
            <button className={`btn ${copiedList ? 'success' : ''}`} onClick={shareCombined}>
              {copiedList ? '✓ Copied' : '🔗 Share combined list'}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => setCreating(true)}>
            ＋ New swap
          </button>
        )}
      </div>

      {showGroup && pool && gm && (
        <InternalMovesPanel
          moves={pool.internalMoves}
          members={gm.members}
          onApply={(m) => applyInternalMove(m.fromId, m.toId, m.id)}
        />
      )}

      {listSwaps.length === 0 && (
        <div className="empty-state">
          <div className="big-emoji">🔄</div>
          <p>
            {showGroup ? (
              <>No combined swaps yet. {tapVerb()} <b>New combined swap</b> to trade the whole group at once.</>
            ) : (
              <>No swaps yet. {tapVerb()} <b>New swap</b>, paste another collector's list, and the app finds which stickers you can trade.</>
            )}
          </p>
        </div>
      )}

      {open.map((s) => (
        <SwapCard
          key={s.id}
          swap={s}
          conflicts={showGroup ? 0 : swapConflictCount(s)}
          onOpen={() => setOpenSwap(s)}
        />
      ))}

      {closed.length > 0 && <div className="section-title">Concluded</div>}
      {closed.map((s) => (
        <SwapCard key={s.id} swap={s} conflicts={0} onOpen={() => setOpenSwap(s)} />
      ))}

      {creating && (
        <NewSwapDialog groupCtx={showGroup ? combinedCtx : undefined} onClose={() => setCreating(false)} />
      )}
      {liveOpenSwap && (
        <SwapDetail
          swap={liveOpenSwap}
          groupCtx={showGroup ? combinedCtx : undefined}
          onClose={() => setOpenSwap(null)}
        />
      )}
    </div>
  );
}

function SwapCard({
  swap,
  conflicts,
  onOpen,
}: {
  swap: Swap;
  conflicts: number;
  onOpen: () => void;
}) {
  return (
    <div className={`swap-card ${swap.status}`} onClick={onOpen} role="button">
      <div className="swap-top">
        <span className="swap-name">{swap.name}</span>
        <span className={`pill ${swap.status}`}>{swap.status}</span>
      </div>
      <div className="swap-summary">
        <span className="give">↑ Give {totalGiving(swap)}</span>
        <span className="get">↓ Get {activeReceiving(swap).length}</span>
      </div>
      {conflicts > 0 && (
        <div className="conflict-banner">
          ⚠️ {conflicts} sticker{conflicts > 1 ? 's' : ''} also promised in another swap.
        </div>
      )}
    </div>
  );
}
