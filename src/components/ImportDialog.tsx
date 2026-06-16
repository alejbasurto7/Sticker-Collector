import { useState } from 'react';
import { album } from '../data/sampleAlbum';
import { parseExport, parsedToCounts } from '../utils/import';
import { useCollection } from '../store/collectionStore';

interface Props {
  onClose: () => void;
}

const SAMPLE = `Figuritas App - List
Usa Mex Can 26
I need
FWC 🏆: 00, 1, 2
MEX 🇲🇽: 5, 6, 7
To Swap
ARG 🇦🇷: 10, 10, 11`;

export default function ImportDialog({ onClose }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [result, setResult] = useState<string | null>(null);
  const importCounts = useCollection((s) => s.importCounts);

  const apply = () => {
    const parsed = parseExport(text);
    if (parsed.needs.length === 0 && parsed.swaps.length === 0) {
      setResult('No stickers found. Check the format (sections like "I need" / "To Swap").');
      return;
    }
    const allIds = album.stickers.map((s) => s.id);
    if (mode === 'replace') {
      importCounts(parsedToCounts(parsed, allIds), 'replace');
    } else {
      // Merge: only adjust the stickers mentioned in the export.
      const map: Record<string, number> = {};
      for (const id of parsed.needs) map[id] = 0;
      for (const id of parsed.swaps) map[id] = 1 + (parsed.swapQty[id] ?? 1);
      importCounts(map, 'merge');
    }
    const parts = [`Imported: ${parsed.needs.length} missing, ${parsed.swaps.length} swaps.`];
    if (parsed.unmatched.length) {
      parts.push(`Skipped ${parsed.unmatched.length} unknown: ${parsed.unmatched.slice(0, 6).join(', ')}${parsed.unmatched.length > 6 ? '…' : ''}`);
    }
    setResult(parts.join(' '));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import collection</h2>
        <p className="modal-sub">
          Paste a Figuritas export. "I need" stickers become missing; "To Swap" become
          duplicates. In Replace mode everything else is marked owned.
        </p>

        <textarea
          value={text}
          placeholder={SAMPLE}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
        />

        <div className="radio-row">
          <label className={mode === 'replace' ? 'sel' : ''}>
            <input
              type="radio"
              name="mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            Replace
          </label>
          <label className={mode === 'merge' ? 'sel' : ''}>
            <input
              type="radio"
              name="mode"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
            />
            Merge
          </label>
        </div>

        {result && (
          <p className="modal-sub" style={{ marginTop: 12, marginBottom: 0 }}>
            {result}
          </p>
        )}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Close
          </button>
          <button className="btn primary full" onClick={apply} disabled={!text.trim()}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
