import { useState, useEffect } from 'react';
import {
  ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID,
  type AlbumType, type SectionDef,
} from '../../data/albumTypes';
import type { SectionTemplate } from '../../data/layoutGeometry';
import { realSlotCount } from '../../data/layoutGeometry';
import {
  newAlbumType, newTemplate, cloneTemplate, deleteTemplate, copyTemplateToType,
  type RegistryDraft,
} from '../registryOps';
import { albumTypesToSource } from '../serializeTemplates';
import { pushHistory } from './history';
import { useConfirm } from './useConfirm';
import { BTN_SM, clone } from './ui';
import TypeStep from './steps/TypeStep';
import SectionsStep from './steps/SectionsStep';
import TemplateCanvas from './TemplateCanvas';
import BuilderToolbar from './BuilderToolbar';
import BuilderRail from './BuilderRail';
import type { BuilderStep } from './BuilderRail';
import './builder.css';

const DRAFT_KEY = 'figuritas-albumtypes-draft-v1';

const seed = (): RegistryDraft => ({ activeId: ACTIVE_ALBUM_TYPE_ID, types: clone(ALBUM_TYPES) });

/** Load the saved draft, falling back to the code seed if missing/corrupt. */
function loadDraft(): RegistryDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as RegistryDraft;
      if (d && d.types && d.activeId && d.types[d.activeId]) return d;
    }
  } catch {
    /* ignore corrupt draft */
  }
  return seed();
}

const numbersFor = (s: SectionDef, variant: string): string[] =>
  s.numbersByVariant?.[variant] ?? s.numbers;

export default function BuilderShell() {
  const [draft, setDraft] = useState<RegistryDraft>(loadDraft);
  const [past, setPast] = useState<RegistryDraft[]>([]);
  const [future, setFuture] = useState<RegistryDraft[]>([]);
  const { confirm, element: confirmEl } = useConfirm();
  // Reuse the already-loaded draft's activeId (lazy init → reads it once at mount).
  const [editingTypeId, setEditingTypeId] = useState<string>(() => draft.activeId);
  const [previewVariantId, setPreviewVariantId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [step, setStep] = useState<BuilderStep>('type');

  const type: AlbumType = draft.types[editingTypeId] ?? Object.values(draft.types)[0];
  // Keep preview/selection valid even after deletes or a stale saved draft.
  const previewVariant = type.variants.some((v) => v.id === previewVariantId)
    ? previewVariantId
    : type.defaultVariant;
  const section = type.sections.find((s) => s.id === selectedSectionId);
  const template: SectionTemplate | undefined = section ? type.templates[section.templateId] : undefined;
  const previewNumbers = section ? numbersFor(section, previewVariant) : [];
  const otherTypeIds = Object.keys(draft.types).filter((id) => id !== editingTypeId);

  const progressPct =
    type.sections.length === 0
      ? 0
      : Math.round(
          100 *
            type.sections.filter(
              (s) =>
                s.numbers.length > 0 &&
                type.templates[s.templateId] &&
                realSlotCount(type.templates[s.templateId]) === s.numbers.length,
            ).length /
            type.sections.length,
        );

  const commit = (next: RegistryDraft) => {
    setPast((p) => pushHistory(p, draft));
    setFuture([]);
    setDraft(next);
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* quota */ }
  };
  const persist = (d: RegistryDraft) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota */ } };
  const undo = () => {
    setPast((p) => { if (!p.length) return p; const prev = p[p.length - 1];
      setFuture((f) => [draft, ...f]); setDraft(prev); persist(prev); return p.slice(0, -1); });
  };
  const redo = () => {
    setFuture((f) => { if (!f.length) return f; const nextDraft = f[0];
      setPast((p) => [...p, draft]); setDraft(nextDraft); persist(nextDraft); return f.slice(1); });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const updateType = (mut: (t: AlbumType) => AlbumType) =>
    commit({ ...draft, types: { ...draft.types, [editingTypeId]: mut(type) } });

  const focusType = (t: AlbumType) => {
    setEditingTypeId(t.id);
    setPreviewVariantId(t.defaultVariant);
    setSelectedSectionId(t.sections[0]?.id ?? '');
  };

  const selectType = (id: string) => focusType(draft.types[id]);

  const addType = (id: string, name: string) => {
    const t = newAlbumType(id, name);
    commit({ ...draft, types: { ...draft.types, [t.id]: t } });
    focusType(t);
  };

  const resetAll = () => {
    const s = seed();
    commit(s);
    focusType(s.types[s.activeId]);
  };

  const resetType = () => {
    if (!ALBUM_TYPES[editingTypeId]) return; // only code-seeded types can be reset
    updateType(() => clone(ALBUM_TYPES[editingTypeId]));
  };

  const resetTemplate = () => {
    if (!section) return;
    const seedTpl = ALBUM_TYPES[editingTypeId]?.templates[section.templateId];
    if (!seedTpl) return;
    updateType((t) => ({ ...t, templates: { ...t.templates, [section.templateId]: clone(seedTpl) } }));
  };

  const onCanvasChange = (mut: (t: SectionTemplate) => void) => {
    if (!section || !template) return;
    updateType((t) => {
      const next = clone(t);
      mut(next.templates[section.templateId]);
      return next;
    });
  };

  const exportRegistry = async () => {
    const src = albumTypesToSource(draft.types, draft.activeId);
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      /* clipboard may be blocked; the download below still works */
    }
    const blob = new Blob([src], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'albumTypes.generated.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="builder-root">
      {confirmEl}
      <BuilderToolbar
        types={draft.types} editingTypeId={editingTypeId} previewVariant={previewVariant}
        onSelectType={selectType} onPreviewVariant={setPreviewVariantId}
        canUndo={past.length > 0} canRedo={future.length > 0} onUndo={undo} onRedo={redo}
        onJumpExport={() => setStep('export')} onNewType={addType} />
      <BuilderRail step={step} onStep={setStep} progressPct={progressPct}
        onResetType={resetType} onResetAll={resetAll} />
      <div className="builder-workspace">
        {step === 'type' && (
          <TypeStep type={type}
            onRename={(name) => updateType((t) => ({ ...t, name }))}
            onUpdateType={updateType} confirm={confirm} />
        )}
        {step === 'sections' && (
          <SectionsStep
            type={type}
            selectedSectionId={selectedSectionId}
            onSelectSection={setSelectedSectionId}
            onUpdateType={updateType}
            confirm={confirm}
          />
        )}
        {step === 'layout' && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <button style={BTN_SM} onClick={() => updateType((t) => newTemplate(t, 'template'))}>+ template</button>
              {section?.templateId && (
                <>
                  <button style={BTN_SM}
                    onClick={() => updateType((t) => cloneTemplate(t, section.templateId, `${section.templateId}-copy`))}>
                    Clone
                  </button>
                  <button style={BTN_SM} onClick={() => updateType((t) => deleteTemplate(t, section.templateId))}>
                    Delete template
                  </button>
                  {ALBUM_TYPES[editingTypeId]?.templates[section.templateId] && (
                    <button style={BTN_SM} onClick={resetTemplate}>Reset template</button>
                  )}
                  {otherTypeIds.length > 0 && (
                    <label style={{ fontSize: 12 }}>
                      Copy →{' '}
                      <select value="" onChange={(e) => {
                        const to = e.target.value;
                        if (!to) return;
                        const { types, newId } = copyTemplateToType(draft.types, editingTypeId, section.templateId, to);
                        commit({ ...draft, types });
                        alert(`Copied "${section.templateId}" to ${to} as "${newId}".`);
                      }}>
                        <option value="">(album type)</option>
                        {otherTypeIds.map((id) => (<option key={id} value={id}>{id}</option>))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
            {section && template
              ? <TemplateCanvas template={template} numbers={previewNumbers} onChange={onCanvasChange} />
              : <p style={{ opacity: 0.6 }}>Pick a section with a template in Sections first.</p>}
          </>
        )}
        {step === 'export' && (
          <div className="builder-panel"><button className="builder-btn builder-btn--primary" onClick={exportRegistry}>Export registry</button></div>
        )}
      </div>
    </div>
  );
}
