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

  const skipped = (parsed: ReturnType<typeof parseExport>) =>
    parsed.unmatched.length
      ? ` Skipped ${parsed.unmatched.length} unknown: ${parsed.unmatched.slice(0, 6).join(', ')}${parsed.unmatched.length > 6 ? '…' : ''}`
      : '';

  const apply = () => {
    const parsed = parseExport(text);

    if (mode === 'merge') {
      // Merge adds every listed copy on top of the current counts, regardless
      // of which section (or none) each sticker sat under.
      const stickers = Object.keys(parsed.all).length;
      if (stickers === 0) {
        setResult('No stickers found. Check the numbers match this album.');
        return;
      }
      const copies = Object.values(parsed.all).reduce((sum, n) => sum + n, 0);
      importCounts(parsed.all, 'merge');
      setResult(
        `Merged: +${copies} ${copies === 1 ? 'copy' : 'copies'} across ${stickers} ${stickers === 1 ? 'sticker' : 'stickers'}.` +
          skipped(parsed),
      );
      return;
    }

    if (parsed.needs.length === 0 && parsed.swaps.length === 0) {
      setResult('No stickers found. Check the format (sections like "I need" / "To Swap").');
      return;
    }
    const allIds = album.stickers.map((s) => s.id);
    importCounts(parsedToCounts(parsed, allIds), 'replace');
    setResult(
      `Imported: ${parsed.needs.length} missing, ${parsed.swaps.length} swaps.` + skipped(parsed),
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import collection</h2>
        <p className="modal-sub">
          Paste a Figuritas export. <strong>Replace</strong> rebuilds the album from the list:
          "I need" stickers become missing, "To Swap" become duplicates, everything else owned.
          <strong> Merge</strong> just adds every listed copy on top of your current counts —
          the section headers don't matter.
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
