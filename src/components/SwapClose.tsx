import { useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';
import { activeGiving, activeReceiving, giveQtyOf, computeReservations } from '../utils/swap';
import { routeReceived, routeGiven } from '../utils/groupSwap';
import { labelFor } from '../utils/group';
import type { GroupSwapCtx } from '../sync/groupMembers';
import StickerChips from './StickerChips';

interface Props {
  swap: Swap;
  onClose: () => void;
  /** When set, settles a combined swap: routes each copy to an album, writes settledByAlbum. */
  groupCtx?: GroupSwapCtx;
}

/** Confirm which promised stickers were actually exchanged, then settle counts. */
export default function SwapClose({ swap, onClose, groupCtx }: Props) {
  const closeSwap = useCollection((s) => s.closeSwap);
  const closeCombinedSwap = useCollection((s) => s.closeCombinedSwap);
  // Start with only the active (still-selected) stickers checked; deselected ones
  // can still be re-checked here if they ended up being traded after all.
  const [given, setGiven] = useState<Set<string>>(() => new Set(activeGiving(swap)));
  const [received, setReceived] = useState<Set<string>>(() => new Set(activeReceiving(swap)));
  // Group mode only: user's override of an ambiguous single-copy receive (stickerId → albumId).
  const [routeOverride, setRouteOverride] = useState<Record<string, string>>({});

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  // Copies-per-sticker for each side, for the counts and the chip badges.
  const giveQty = new Map(swap.giving.map((id) => [id, giveQtyOf(swap, id)]));
  const givenCopies = [...given].reduce((n, id) => n + (giveQty.get(id) ?? 1), 0);
  const receiveQty = new Map(swap.receiving.map((id) => [id, Math.max(1, swap.receivingQty?.[id] ?? 1)]));
  const receivedCopies = [...received].reduce((n, id) => n + (receiveQty.get(id) ?? 1), 0);

  // --- Group-mode routing (computed only when combining) ---
  const members = groupCtx?.members ?? [];
  const receivedRecord: Record<string, number> = {};
  for (const id of received) receivedRecord[id] = receiveQty.get(id) ?? 1;
  const givenRecord: Record<string, number> = {};
  for (const id of given) givenRecord[id] = giveQty.get(id) ?? 1;

  const receiveRouting = groupCtx ? routeReceived(members, receivedRecord) : null;
  // Each writable member keeps its own solo-reserved spares (give floor holds per album).
  const reservedSpares: Record<string, Record<string, number>> = {};
  if (groupCtx) {
    for (const m of members) {
      reservedSpares[m.id] = Object.fromEntries(computeReservations(m.swaps).committedGive);
    }
  }
  const giveRouting = groupCtx ? routeGiven(members, givenRecord, reservedSpares) : null;

  const nameOf = (albumId: string) => members.find((m) => m.id === albumId)?.name ?? albumId;

  /** Where each received sticker is written (with an ambiguous single-copy override applied). */
  const receiveTargets = (id: string): string[] => {
    const amb = receiveRouting?.ambiguous.find((a) => a.id === id);
    if (amb && amb.chosenIds.length === 1) return [routeOverride[id] ?? amb.chosenIds[0]];
    const targets: string[] = [];
    for (const [aid, m] of Object.entries(receiveRouting?.writes ?? {})) {
      if ((m[id] ?? 0) > 0) targets.push(aid);
    }
    return targets;
  };

  const confirm = () => {
    // Carry the per-sticker copy counts so settlement removes every given copy.
    const settledGiveQty: Record<string, number> = {};
    for (const id of given) {
      const q = giveQty.get(id) ?? 1;
      if (q > 1) settledGiveQty[id] = q;
    }

    if (groupCtx && receiveRouting && giveRouting) {
      const settledByAlbum: Record<string, Record<string, number>> = {};
      const add = (aid: string, id: string, n: number) => {
        (settledByAlbum[aid] ??= {})[id] = (settledByAlbum[aid][id] ?? 0) + n;
      };
      // Received copies (positive), honouring the default routing.
      for (const [aid, m] of Object.entries(receiveRouting.writes)) {
        for (const [id, n] of Object.entries(m)) add(aid, id, n);
      }
      // Apply single-copy ambiguous overrides: move the copy from the default to the chosen album.
      for (const amb of receiveRouting.ambiguous) {
        if (amb.chosenIds.length !== 1) continue;
        const chosen = routeOverride[amb.id];
        if (chosen && chosen !== amb.chosenIds[0]) {
          add(amb.chosenIds[0], amb.id, -1);
          add(chosen, amb.id, 1);
        }
      }
      // Given copies (negative).
      for (const [aid, m] of Object.entries(giveRouting.writes)) {
        for (const [id, n] of Object.entries(m)) add(aid, id, n);
      }
      closeCombinedSwap(groupCtx.groupId, swap.id, {
        givenIds: [...given],
        receivedIds: [...received],
        giveQty: settledGiveQty,
        receiveQty: receivedRecord,
        settledByAlbum,
      });
    } else {
      closeSwap(swap.id, {
        givenIds: [...given],
        receivedIds: [...received],
        giveQty: settledGiveQty,
      });
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Mark “{swap.name}” as swapped</h2>
        <p className="modal-sub">
          {groupCtx
            ? 'Confirm what was exchanged. Received stickers are routed to the album that needs them; spares are removed from a member with a duplicate.'
            : 'Confirm what was actually exchanged. Given stickers will be removed from your duplicates; received stickers will be added to your collection.'}
        </p>

        <div className="section-title">You gave ({givenCopies})</div>
        <StickerChips
          ids={swap.giving}
          selected={given}
          quantities={giveQty}
          onToggle={(id) => toggle(given, setGiven, id)}
        />
        {groupCtx && giveRouting && [...given].length > 0 && (
          <div className="close-routes">
            {[...given].map((id) => {
              const from = Object.keys(giveRouting.writes).filter((aid) => (giveRouting.writes[aid][id] ?? 0) < 0);
              if (from.length === 0) return null;
              return (
                <div className="close-route" key={id}>
                  {labelFor(id)} — from {from.map(nameOf).join(', ')}
                </div>
              );
            })}
          </div>
        )}

        <div className="section-title">You received ({groupCtx ? receivedCopies : received.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={received}
          quantities={groupCtx ? receiveQty : undefined}
          onToggle={(id) => toggle(received, setReceived, id)}
        />
        {groupCtx && receiveRouting && (
          <div className="close-routes">
            {[...received].map((id) => {
              const amb = receiveRouting.ambiguous.find((a) => a.id === id);
              const targets = receiveTargets(id);
              const handoffs = receiveRouting.handoffs.filter((h) => h.id === id);
              return (
                <div className="close-route" key={id}>
                  <span>
                    {labelFor(id)} → {targets.map(nameOf).join(', ') || '—'}
                  </span>
                  {amb && amb.chosenIds.length === 1 && (
                    <select
                      className="route-change"
                      value={routeOverride[id] ?? amb.chosenIds[0]}
                      onChange={(e) => setRouteOverride((prev) => ({ ...prev, [id]: e.target.value }))}
                    >
                      {amb.options.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  )}
                  {handoffs.map((h) => (
                    <span className="close-handoff" key={h.memberId}>
                      🤝 give to {h.memberName} — not recorded
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary full" onClick={confirm}>
            🤝 Mark as swapped
          </button>
        </div>
      </div>
    </div>
  );
}
