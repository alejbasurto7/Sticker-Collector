import { useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { parseExport } from '../utils/import';
import { computeCandidates } from '../utils/swap';
import StickerChips from './StickerChips';

interface Props {
  onClose: () => void;
  initialText?: string;
}

const SAMPLE = `Figuritas App - List
Usa Mex Can 26
I need
BRA 🇧🇷: 3, 4, 5
To Swap
MEX 🇲🇽: 7, 8`;

export default function NewSwapDialog({ onClose, initialText }: Props) {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const createSwap = useCollection((s) => s.createSwap);

  const [name, setName] = useState('');
  const [text, setText] = useState(initialText ?? '');
  const [parsed, setParsed] = useState<ReturnType<typeof parseExport> | null>(null);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());

  // Existing promises across open swaps (for conflict preview).
  const existingGiving = useMemo(
    () => new Set(swaps.filter((s) => s.status === 'open').flatMap((s) => s.giving)),
    [swaps],
  );
  const existingReceiving = useMemo(
    () => new Set(swaps.filter((s) => s.status === 'open').flatMap((s) => s.receiving)),
    [swaps],
  );

  const candidates = useMemo(
    () => (parsed ? computeCandidates(counts, parsed) : null),
    [parsed, counts],
  );

  const findMatches = () => {
    const p = parseExport(text);
    setParsed(p);
    const c = computeCandidates(counts, p);
    setGive(new Set(c.youGive));
    setGet(new Set(c.youGet));
  };

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const save = () => {
    if (!parsed) return;
    createSwap({
      name,
      theirNeeds: parsed.needs,
      theirSwaps: parsed.swaps,
      giving: [...give],
      receiving: [...get],
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New swap</h2>
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
              You can give ({give.size}/{candidates.youGive.length})
            </div>
            <StickerChips
              ids={candidates.youGive}
              selected={give}
              conflicts={existingGiving}
              onToggle={(id) => toggle(give, setGive, id)}
            />

            <div className="section-title">
              You can get ({get.size}/{candidates.youGet.length})
            </div>
            <StickerChips
              ids={candidates.youGet}
              selected={get}
              conflicts={existingReceiving}
              onToggle={(id) => toggle(get, setGet, id)}
            />

            {candidates.youGive.length === 0 && candidates.youGet.length === 0 && (
              <p className="empty-note">No matching stickers with this collector.</p>
            )}
          </>
        )}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary full" onClick={save} disabled={!parsed}>
            Save swap
          </button>
        </div>
      </div>
    </div>
  );
}
