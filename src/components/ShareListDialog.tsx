import { useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { buildListExport, type ListExportScope } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';

interface Props {
  onClose: () => void;
}

interface Option {
  scope: ListExportScope;
  label: string;
  icon: JSX.Element;
}

// Line icons styled to match the app's stroke iconography.
const OPTIONS: Option[] = [
  {
    scope: 'both',
    label: 'Missing & swaps',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
  },
  {
    scope: 'needs',
    label: 'Only missing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="m9 10 6 6" />
        <path d="m15 10-6 6" />
      </svg>
    ),
  },
  {
    scope: 'swaps',
    label: 'Only swaps',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 9h7l-2-2" />
        <path d="M16 15H9l2 2" />
      </svg>
    ),
  },
];

export default function ShareListDialog({ onClose }: Props) {
  const counts = useCollection((s) => s.counts);
  const albumName = useCollection((s) => s.albumName);
  const [includeSwapQty, setIncludeSwapQty] = useState(true);
  const [copied, setCopied] = useState<ListExportScope | null>(null);

  async function handleShare(scope: ListExportScope) {
    const text = buildListExport(counts, albumName, scope, includeSwapQty);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(scope);
      // Give the user a beat to see the confirmation before the sheet closes.
      window.setTimeout(onClose, 900);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ textAlign: 'center', marginBottom: 14 }}>Select stickers to share</h2>

        <div className="share-options">
          {OPTIONS.map((opt) => (
            <button
              key={opt.scope}
              type="button"
              className="share-option"
              onClick={() => handleShare(opt.scope)}
            >
              <span className="share-option-icon">{opt.icon}</span>
              <span className="share-option-label">{opt.label}</span>
              {copied === opt.scope && <span className="share-option-copied">Copied ✓</span>}
            </button>
          ))}
        </div>

        <label className="share-qty-toggle">
          <input
            type="checkbox"
            checked={includeSwapQty}
            onChange={(e) => setIncludeSwapQty(e.target.checked)}
          />
          <span>Include swap quantities of each sticker</span>
        </label>
      </div>
    </div>
  );
}
