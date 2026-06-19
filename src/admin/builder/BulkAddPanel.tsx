import { useState } from 'react';
import { type AlbumType } from '../../data/albumTypes';
import type { PageType } from '../../types';
import { bulkAddSections, parseBulkLines, parseNumbers, fillNumbers } from '../registryOps';

interface BulkAddPanelProps {
  type: AlbumType;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
}

export default function BulkAddPanel({ type, onUpdateType }: BulkAddPanelProps) {
  const [open, setOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkTemplate, setBulkTemplate] = useState('');
  const [bulkType, setBulkType] = useState<PageType>('team');
  const [bulkNumbers, setBulkNumbers] = useState('');
  const [bulkFoils, setBulkFoils] = useState('');
  const [fillN, setFillN] = useState<number>(0);

  const rows = parseBulkLines(bulkText);

  const handleAdd = () => {
    onUpdateType((t) =>
      bulkAddSections(t, rows, {
        templateId: bulkTemplate,
        numbers: parseNumbers(bulkNumbers),
        foils: parseNumbers(bulkFoils),
        type: bulkType,
      }),
    );
    setBulkText('');
  };

  return (
    <div className="builder-panel">
      <button
        className="builder-btn builder-btn--ghost builder-btn--sm"
        onClick={() => setOpen((v) => !v)}
        style={{ fontWeight: 600 }}
      >
        {open ? '▾ Bulk add sections' : '▸ Bulk add sections'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="builder-textarea"
            rows={4}
            placeholder={'MEX, 🇲🇽, Mexico\nUSA, 🇺🇸, United States'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />

          <div className="builder-field-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <select
              className="builder-select"
              value={bulkTemplate}
              onChange={(e) => setBulkTemplate(e.target.value)}
            >
              <option value="">(no template)</option>
              {Object.keys(type.templates).map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>

            <select
              className="builder-select"
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value as PageType)}
            >
              <option value="team">team</option>
              <option value="intro">intro</option>
              <option value="extra">extra</option>
            </select>

            <input
              className="builder-input"
              placeholder="numbers e.g. 1,2,3"
              value={bulkNumbers}
              onChange={(e) => setBulkNumbers(e.target.value)}
              style={{ flex: 1 }}
            />

            <input
              className="builder-input"
              type="number"
              min={1}
              placeholder="N"
              value={fillN || ''}
              onChange={(e) => setFillN(Number(e.target.value))}
              style={{ width: 64 }}
            />
            <button
              className="builder-btn builder-btn--sm"
              onClick={() => { if (fillN > 0) setBulkNumbers(fillNumbers(fillN).join(',')); }}
            >
              Fill 1..N
            </button>

            <input
              className="builder-input"
              placeholder="foils e.g. 1"
              value={bulkFoils}
              onChange={(e) => setBulkFoils(e.target.value)}
              style={{ width: 100 }}
            />
          </div>

          {/* Live preview */}
          {bulkText.trim() && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 4px' }}>
                {rows.length} section{rows.length !== 1 ? 's' : ''} will be added
              </p>
              <table style={{ fontSize: 12, width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ opacity: 0.6 }}>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>Emoji</th>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '2px 6px' }}>
                        {r.code ? (
                          r.code
                        ) : (
                          <span className="builder-validation builder-validation--warn">
                            blank code → auto-id
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '2px 6px' }}>{r.emoji}</td>
                      <td style={{ padding: '2px 6px' }}>{r.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <button
              className="builder-btn builder-btn--primary"
              disabled={rows.length === 0}
              onClick={handleAdd}
            >
              Add sections
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
