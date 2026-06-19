import { useState } from 'react';
import { type AlbumType, type SectionDef } from '../../data/albumTypes';
import type { PageType } from '../../types';
import { realSlotCount } from '../../data/layoutGeometry';
import { updateSection, parseNumbers, fillNumbers } from '../registryOps';

interface SectionInspectorProps {
  type: AlbumType;
  section: SectionDef;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
}

export default function SectionInspector({ type, section, onUpdateType }: SectionInspectorProps) {
  const [fillN, setFillN] = useState<number>(0);

  const patch = (p: Partial<SectionDef>) =>
    onUpdateType((t) => updateSection(t, section.id, p));

  const tpl = type.templates[section.templateId];
  const slots = tpl ? realSlotCount(tpl) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Identity */}
      <div className="builder-panel">
        <strong>Identity</strong>
        <div className="builder-field-row">
          <span className="builder-field-label">Code</span>
          <input
            className="builder-input"
            value={section.code}
            onChange={(e) => patch({ code: e.target.value })}
          />
        </div>
        <div className="builder-field-row">
          <span className="builder-field-label">Emoji</span>
          <input
            className="builder-input"
            value={section.emoji}
            onChange={(e) => patch({ emoji: e.target.value })}
            style={{ width: 64 }}
          />
        </div>
        <div className="builder-field-row">
          <span className="builder-field-label">Title</span>
          <input
            className="builder-input"
            value={section.title}
            onChange={(e) => patch({ title: e.target.value })}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* Classification */}
      <div className="builder-panel">
        <strong>Classification</strong>
        <div className="builder-field-row">
          <span className="builder-field-label">Type</span>
          <select
            className="builder-select"
            value={section.type}
            onChange={(e) => patch({ type: e.target.value as PageType })}
          >
            <option value="team">team</option>
            <option value="intro">intro</option>
            <option value="extra">extra</option>
          </select>
        </div>
        <div className="builder-field-row">
          <span className="builder-field-label">Template</span>
          <select
            className="builder-select"
            value={section.templateId}
            onChange={(e) => patch({ templateId: e.target.value })}
          >
            <option value="">(none)</option>
            {Object.keys(type.templates).map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        <div className="builder-field-row">
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!section.optional}
              onChange={(e) => patch({ optional: e.target.checked || undefined })}
            />{' '}
            Optional (opt-in section)
          </label>
        </div>
        <div className="builder-field-row">
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!section.prefixNumbers}
              onChange={(e) => patch({ prefixNumbers: e.target.checked || undefined })}
            />{' '}
            Prefix numbers with code (display only, e.g. "{section.code}1")
          </label>
        </div>
      </div>

      {/* Numbers */}
      <div className="builder-panel">
        <strong>Numbers</strong>
        <div className="builder-field-row">
          <span className="builder-field-label">Numbers</span>
          <input
            className="builder-input"
            value={section.numbers.join(',')}
            onChange={(e) => patch({ numbers: parseNumbers(e.target.value) })}
            style={{ flex: 1 }}
          />
        </div>
        <div className="builder-field-row" style={{ marginTop: 4 }}>
          <span className="builder-field-label">Fill 1..N</span>
          <input
            className="builder-input"
            type="number"
            min={1}
            value={fillN || ''}
            onChange={(e) => setFillN(Number(e.target.value))}
            style={{ width: 64 }}
          />
          <button
            className="builder-btn builder-btn--sm"
            onClick={() => { if (fillN > 0) patch({ numbers: fillNumbers(fillN) }); }}
          >
            Fill 1..N
          </button>
        </div>
        {section.numbers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {section.numbers.map((n) => (
              <span className="builder-chip" key={n}>{n}</span>
            ))}
          </div>
        )}
        <div className="builder-field-row" style={{ marginTop: 8 }}>
          <span className="builder-field-label">Foils</span>
          <input
            className="builder-input"
            value={section.foils.join(',')}
            onChange={(e) => patch({ foils: parseNumbers(e.target.value) })}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* Per-variant overrides */}
      {type.variants.length > 1 && (
        <div className="builder-panel">
          <strong>Per-variant numbers</strong>
          <p style={{ fontSize: 12, opacity: 0.6, margin: '2px 0 8px' }}>
            Blank = use base numbers
          </p>
          {type.variants.map((v) => (
            <div key={v.id} className="builder-field-row">
              <span className="builder-field-label">{v.label}</span>
              <input
                className="builder-input"
                placeholder="(base)"
                style={{ flex: 1 }}
                value={(section.numbersByVariant?.[v.id] ?? []).join(',')}
                onChange={(e) => {
                  const tokens = parseNumbers(e.target.value);
                  const next = { ...(section.numbersByVariant ?? {}) };
                  if (tokens.length === 0) delete next[v.id]; else next[v.id] = tokens;
                  patch({ numbersByVariant: Object.keys(next).length ? next : undefined });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Validation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tpl && slots !== section.numbers.length && (
          <span className="builder-validation builder-validation--warn">
            ⚠ {section.numbers.length} numbers vs {slots} real slots in "{section.templateId}" — adjust numbers or edit slots in Layout.
          </span>
        )}
        {section.numbers.length > 0 && !tpl && (
          <span className="builder-validation builder-validation--warn">
            No template assigned.
          </span>
        )}
        {type.variants.length > 1 && tpl && type.variants.map((v) => {
          const override = section.numbersByVariant?.[v.id];
          if (!override || override.length === 0) return null;
          if (override.length === slots) return null;
          return (
            <span key={v.id} className="builder-validation builder-validation--warn">
              Variant "{v.label}" override count ({override.length}) ≠ slots ({slots}).
            </span>
          );
        })}
      </div>
    </div>
  );
}
