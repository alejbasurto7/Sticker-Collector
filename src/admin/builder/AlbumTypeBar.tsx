import { useState } from 'react';
import type { AlbumType } from '../../data/albumTypes';
import { addVariant, updateVariant, removeVariant, setDefaultVariant } from '../registryOps';
import { BTN, BTN_SM } from './ui';

interface AlbumTypeBarProps {
  types: Record<string, AlbumType>;
  editingTypeId: string;
  previewVariant: string;
  onSelectType: (id: string) => void;
  onNewType: (id: string, name: string) => void;
  onPreviewVariant: (variantId: string) => void;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  onExport: () => void;
  onResetAll: () => void;
  onResetType: () => void;
}

export default function AlbumTypeBar({
  types, editingTypeId, previewVariant, onSelectType, onNewType,
  onPreviewVariant, onUpdateType, onExport, onResetAll, onResetType,
}: AlbumTypeBarProps) {
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const type = types[editingTypeId];
  if (!type) return null; // editingTypeId is always a live id in practice; guard hardens the deref

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Album type:{' '}
          <select value={editingTypeId} onChange={(e) => onSelectType(e.target.value)}>
            {Object.values(types).map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
            ))}
          </select>
        </label>
        <input placeholder="new-id" value={newId} onChange={(e) => setNewId(e.target.value)} style={{ width: 110 }} />
        <input placeholder="New name" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: 140 }} />
        <button style={BTN} onClick={() => {
          if (!newId.trim()) return;
          onNewType(newId.trim(), newName);
          setNewId(''); setNewName('');
        }}>+ album type</button>
        <button style={BTN} onClick={onExport}>Export registry</button>
        <button style={BTN} onClick={onResetType}>Reset this type</button>
        <button style={BTN} onClick={onResetAll}>Reset all</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>Variants:</strong>
        {type.variants.map((v) => (
          <span key={v.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center',
            border: '1px solid #3a4a60', borderRadius: 6, padding: '2px 6px' }}>
            <input value={v.label} aria-label={`${v.id} label`} style={{ width: 90 }}
              onChange={(e) => onUpdateType((t) => updateVariant(t, v.id, { label: e.target.value }))} />
            <input value={v.region ?? ''} placeholder="region" aria-label={`${v.id} region`} style={{ width: 90 }}
              onChange={(e) => onUpdateType((t) => updateVariant(t, v.id, { region: e.target.value }))} />
            <label style={{ fontSize: 11 }}>
              <input type="radio" name="defaultVariant" checked={type.defaultVariant === v.id}
                onChange={() => onUpdateType((t) => setDefaultVariant(t, v.id))} /> default
            </label>
            <button style={BTN_SM} onClick={() => onUpdateType((t) => removeVariant(t, v.id))}>✕</button>
          </span>
        ))}
        <button style={BTN_SM}
          onClick={() => onUpdateType((t) => addVariant(t, { id: `v${t.variants.length + 1}`, label: 'Variant' }))}>
          + variant
        </button>
        <label style={{ marginLeft: 8 }}>
          Preview as:{' '}
          <select value={previewVariant} onChange={(e) => onPreviewVariant(e.target.value)}>
            {type.variants.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
          </select>
        </label>
      </div>
    </div>
  );
}
