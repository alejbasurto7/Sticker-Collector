import { useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';
import { activeGiving, activeReceiving, giveQtyOf, computeReservations } from '../utils/swap';
import {
  routeReceived, routeGiven, swapRoutingInput, overrideIsLive, buildSettledByAlbum,
  summariseWaiting,
} from '../utils/groupSwap';
import { labelFor } from '../utils/group';
import type { GroupSwapCtx } from '../sync/groupMembers';
import StickerChips from './StickerChips';
import { useGroupBadges } from './useGroupBadges';
import GroupLegend from './GroupLegend';

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

  /**
   * Badges describe the PROMISED set, while receiveRouting/giveRouting above settle the
   * CHECKED set. Routing is per-sticker independent, so the two agree on every checked
   * chip — and using the promised set stops an unchecked chip's marks from blanking out
   * and jumping back when it is re-checked.
   */
  const routingInput = swapRoutingInput(swap);
  const badges = useGroupBadges(groupCtx, routingInput.giving, routingInput.receiving, routeOverride);

  const confirm = () => {
    // Carry the per-sticker copy counts so settlement removes every given copy.
    const settledGiveQty: Record<string, number> = {};
    for (const id of given) {
      const q = giveQty.get(id) ?? 1;
      if (q > 1) settledGiveQty[id] = q;
    }

    if (groupCtx && receiveRouting && giveRouting) {
      closeCombinedSwap(groupCtx.groupId, swap.id, {
        givenIds: [...given],
        receivedIds: [...received],
        giveQty: settledGiveQty,
        receiveQty: receivedRecord,
        settledByAlbum: buildSettledByAlbum(receiveRouting, giveRouting, routeOverride),
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

  // Only checked stickers are settled, so only they can still need a decision.
  const needsCall = (receiveRouting?.ambiguous ?? []).filter(
    (a) => a.chosenIds.length === 1 && received.has(a.id),
  );
  const handoffRows = (receiveRouting?.handoffs ?? []).filter((h) => received.has(h.id));
  // View-only members no copy reaches. Nothing to do about it here, but naming them beats
  // listing only the lucky one and letting the rest disappear.
  const waitingRows = summariseWaiting(receiveRouting?.waiting ?? [], received);
  // Stickers the give pool couldn't source a spare for (e.g. the only spare is reserved by
  // that album's own solo swap) — surface this instead of silently telling the user a
  // sticker left an album that never actually gave it up.
  const shortRows = Object.keys(giveRouting?.short ?? {}).filter((id) => given.has(id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Mark “{swap.name}” as swapped</h2>
        <p className="modal-sub">
          {groupCtx
            ? 'Confirm what was exchanged. Received stickers are routed to the album that needs them; spares are removed from a member with a duplicate.'
            : 'Confirm what was actually exchanged. Given stickers will be removed from your duplicates; received stickers will be added to your collection.'}
        </p>

        {badges && <GroupLegend members={badges.members} />}

        <div className="section-title">You gave ({givenCopies})</div>
        <StickerChips
          ids={swap.giving}
          selected={given}
          quantities={giveQty}
          badges={badges?.give}
          onToggle={(id) => toggle(given, setGiven, id)}
        />

        <div className="section-title">You received ({groupCtx ? receivedCopies : received.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={received}
          quantities={groupCtx ? receiveQty : undefined}
          badges={badges?.get}
          onToggle={(id) => toggle(received, setReceived, id)}
        />

        {groupCtx && receiveRouting &&
          (needsCall.length > 0 || handoffRows.length > 0 || waitingRows.length > 0 || shortRows.length > 0) && (
          <div className="needs-call">
            <div className="nc-title">⚠️ Needs your call</div>
            {needsCall.map((amb) => (
              <div className="nc-row" key={amb.id}>
                <span className="nc-sticker">{labelFor(amb.id)}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {amb.options.length} albums need it, {receiveQty.get(amb.id) ?? 1} copy →
                </span>
                <select
                  className="route-change"
                  value={overrideIsLive(amb.options, routeOverride[amb.id]) ? routeOverride[amb.id] : amb.chosenIds[0]}
                  onChange={(e) => setRouteOverride((prev) => ({ ...prev, [amb.id]: e.target.value }))}
                >
                  {amb.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {handoffRows.map((h) => (
              <div className="nc-row" key={`${h.id}-${h.memberId}`}>
                <span className="nc-sticker">{labelFor(h.id)}</span>
                <span className="nc-handoff">🤝 hand to {h.memberName} — not recorded</span>
              </div>
            ))}
            {waitingRows.map((wr) => (
              <div className="nc-row" key={`wait-${wr.memberId}`}>
                <span className="nc-sticker">
                  {wr.ids.length === 1 ? labelFor(wr.ids[0]) : `${wr.ids.length} stickers`}
                </span>
                <span className="nc-waiting">
                  ⏳ {wr.memberName} still needs {wr.ids.length === 1 ? 'this one' : 'these'} — no
                  {wr.ids.length === 1 ? ' copy' : ' copies'} left this time
                </span>
              </div>
            ))}
            {shortRows.map((id) => {
              const missing = giveRouting?.short?.[id] ?? 0;
              const promised = giveQty.get(id) ?? 1;
              return (
                <div className="nc-row" key={`short-${id}`}>
                  <span className="nc-sticker">{labelFor(id)}</span>
                  <span style={{ color: 'var(--text-dim)' }}>
                    {missing >= promised
                      ? 'no album has a free spare — nothing will be removed'
                      : `only ${promised - missing} of ${promised} copies can be removed — no album has a free spare for the rest`}
                  </span>
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
