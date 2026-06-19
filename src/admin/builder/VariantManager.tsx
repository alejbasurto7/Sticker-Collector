import type { AlbumType } from '../../data/albumTypes';
import { addVariant, updateVariant, removeVariant, setDefaultVariant } from '../registryOps';
import { type Confirm } from './useConfirm';

interface VariantManagerProps {
  type: AlbumType;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  confirm: Confirm;
}

export default function VariantManager({ type, onUpdateType, confirm }: VariantManagerProps) {
  return (
    <div className="builder-panel">
      <strong>Variants</strong>
      {type.variants.map((v) => (
        <div key={v.id} className="builder-field-row">
          <span className="builder-field-label">{v.id}</span>
          <input
            className="builder-input"
            value={v.label}
            aria-label={`${v.id} label`}
            onChange={(e) => onUpdateType((t) => updateVariant(t, v.id, { label: e.target.value }))}
          />
          <input
            className="builder-input"
            value={v.region ?? ''}
            placeholder="region"
            aria-label={`${v.id} region`}
            onChange={(e) => onUpdateType((t) => updateVariant(t, v.id, { region: e.target.value }))}
          />
          <label style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            <input
              type="radio"
              name="defaultVariant"
              checked={type.defaultVariant === v.id}
              onChange={() => onUpdateType((t) => setDefaultVariant(t, v.id))}
            />{' '}
            default
          </label>
          <button
            className="builder-btn builder-btn--danger builder-btn--sm"
            disabled={type.variants.length <= 1}
            onClick={async () => {
              if (type.variants.length <= 1) return;
              const ok = await confirm({
                message: `Remove variant "${v.label}"?`,
                confirmLabel: 'Remove',
                danger: true,
              });
              if (ok) onUpdateType((t) => removeVariant(t, v.id));
            }}
          >
            Remove
          </button>
        </div>
      ))}
      {type.variants.length <= 1 && (
        <p style={{ fontSize: 12, opacity: 0.7, margin: '4px 0' }}>
          An album type always has at least one variant.
        </p>
      )}
      <button
        className="builder-btn builder-btn--sm"
        onClick={() =>
          onUpdateType((t) =>
            addVariant(t, { id: `v${t.variants.length + 1}`, label: 'Variant' }),
          )
        }
      >
        + variant
      </button>
    </div>
  );
}
