import { useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { parseExport } from '../utils/import';
import { buildListFromIds } from '../utils/listExport';
import { computeCandidates, computeReservations } from '../utils/swap';
import type { Swap } from '../types';
import StickerChips from './StickerChips';

interface Props {
  onClose: () => void;
  initialText?: string;
  /** When set, the dialog edits this existing swap instead of creating a new one. */
  editSwap?: Swap;
}

const SAMPLE = `Figuritas App - List
Usa Mex Can 26
I need
BRA 🇧🇷: 3, 4, 5
To Swap
MEX 🇲🇽: 7, 8`;

/** Candidate ids to render: fresh candidates first, then any still-selected ids
 *  no longer offered (e.g. an existing pick whose spare situation has changed). */
const displayIds = (candidateIds: string[], selected: Set<string>) => {
  const extra = [...selected].filter((id) => !candidateIds.includes(id));
  return [...candidateIds, ...extra];
};

/** Total copies across a selection, reading per-sticker quantities (default 1). */
const sumCopies = (ids: Iterable<string>, qty: Map<string, number>) => {
  let n = 0;
  for (const id of ids) n += qty.get(id) ?? 1;
  return n;
};

export default function NewSwapDialog({ onClose, initialText, editSwap }: Props) {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const albumName = useCollection((s) => s.albumName);
  const createSwap = useCollection((s) => s.createSwap);
  const updateSwap = useCollection((s) => s.updateSwap);

  const isEdit = !!editSwap;

  const [name, setName] = useState(editSwap?.name ?? '');
  const [notes, setNotes] = useState(editSwap?.notes ?? '');
  const [text, setText] = useState(
    editSwap
      ? buildListFromIds(editSwap.theirNeeds, editSwap.theirSwaps, albumName, editSwap.theirNeedsQty)
      : initialText ?? '',
  );
  // In edit mode, seed straight from the saved swap so its matches show without a re-scan.
  const [parsed, setParsed] = useState<ReturnType<typeof parseExport> | null>(
    editSwap
      ? {
          needs: editSwap.theirNeeds,
          swaps: editSwap.theirSwaps,
          swapQty: {},
          needQty: editSwap.theirNeedsQty ?? {},
          all: {},
          unmatched: [],
        }
      : null,
  );
  const [give, setGive] = useState<Set<string>>(() => new Set(editSwap?.giving ?? []));
  const [get, setGet] = useState<Set<string>>(() => new Set(editSwap?.receiving ?? []));
  // Copies to give per sticker id — seeded from the saved swap, refreshed on each scan.
  const [giveQty, setGiveQty] = useState<Map<string, number>>(
    () => new Map(Object.entries(editSwap?.givingQty ?? {})),
  );

  // Live reservations across all open swaps, so spares already promised elsewhere are
  // never offered here and a sticker already being received is never chased again. When
  // editing, exclude this swap so its own promises don't count against itself.
  const reservations = useMemo(
    () => computeReservations(swaps, editSwap?.id),
    [swaps, editSwap?.id],
  );

  const candidates = useMemo(
    () => (parsed ? computeCandidates(counts, parsed, reservations) : null),
    [parsed, counts, reservations],
  );

  const findMatches = () => {
    const p = parseExport(text);
    setParsed(p);
    const c = computeCandidates(counts, p, reservations);
    // Auto-select the freely available matches; leave anything already promised in
    // another open swap unselected so double-booking is an opt-in (the ⚠️ flags it).
    setGive(new Set(c.youGive.filter((id) => !c.giveReserved.has(id))));
    setGet(new Set(c.youGet.filter((id) => !c.getReserved.has(id))));
    setGiveQty(new Map(Object.entries(c.giveQty)));
  };

  // Tooltip maps that mark candidates already spoken for in another open swap, so the
  // chips show a ⚠️ instead of the sticker just going missing from the results.
  const giveConflicts = useMemo(() => {
    const m = new Map<string, string>();
    candidates?.giveReserved.forEach((id) =>
      m.set(id, 'Your spare is already promised in another open swap.'),
    );
    return m;
  }, [candidates]);

  const getConflicts = useMemo(() => {
    const m = new Map<string, string>();
    candidates?.getReserved.forEach((id) =>
      m.set(id, "You're already lined up to receive this in another open swap."),
    );
    return m;
  }, [candidates]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const save = () => {
    if (!parsed) return;
    // Persist only the copies for stickers still selected to give.
    const givingQty: Record<string, number> = {};
    for (const id of give) {
      const q = giveQty.get(id) ?? 1;
      if (q > 1) givingQty[id] = q;
    }
    const common = {
      name,
      notes,
      theirNeeds: parsed.needs,
      theirSwaps: parsed.swaps,
      theirNeedsQty: parsed.needQty,
      giving: [...give],
      receiving: [...get],
      givingQty,
    };
    if (editSwap) updateSwap(editSwap.id, common);
    else createSwap(common);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit swap' : 'New swap'}</h2>
        <p className="modal-sub">
          Name the swap and paste the other collector's exported list to find matches.
        </p>

        <div className="field-label">Swap name</div>
        <input
          type="text"
          value={name}
          placeholder="e.g. Carlos"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-label">Their list</div>
        <textarea
          value={text}
          placeholder={SAMPLE}
          onChange={(e) => setText(e.target.value)}
        />

        <button className="btn full" style={{ marginTop: 10 }} onClick={findMatches} disabled={!text.trim()}>
          🔍 Find matches
        </button>

        {candidates && (
          <>
            <div className="section-title">
              You can give ({sumCopies(give, giveQty)}/{sumCopies(candidates.youGive, giveQty)})
            </div>
            <StickerChips
              ids={displayIds(candidates.youGive, give)}
              selected={give}
              onToggle={(id) => toggle(give, setGive, id)}
              conflicts={giveConflicts}
              quantities={giveQty}
            />
            {candidates.giveReserved.size > 0 && (
              <p className="reserved-note">
                ⚠️ {candidates.giveReserved.size} spare
                {candidates.giveReserved.size > 1 ? 's are' : ' is'} already promised in
                another open swap. Tap to include and double-book anyway.
              </p>
            )}

            <div className="section-title">
              You can get ({get.size}/{candidates.youGet.length})
            </div>
            <StickerChips
              ids={displayIds(candidates.youGet, get)}
              selected={get}
              onToggle={(id) => toggle(get, setGet, id)}
              conflicts={getConflicts}
            />
            {candidates.getReserved.size > 0 && (
              <p className="reserved-note">
                ⚠️ {candidates.getReserved.size} sticker
                {candidates.getReserved.size > 1 ? 's are' : ' is'} already coming from
                another open swap. Tap to include if you want a backup.
              </p>
            )}

            {candidates.youGive.length === 0 && candidates.youGet.length === 0 && (
              <p className="empty-note">No matching stickers with this collector.</p>
            )}
          </>
        )}

        <div className="field-label">Notes</div>
        <textarea
          className="notes-input"
          value={notes}
          placeholder="Anything to remember about this swap…"
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary full" onClick={save} disabled={!parsed}>
            {isEdit ? 'Save changes' : 'Save swap'}
          </button>
        </div>
      </div>
    </div>
  );
}
