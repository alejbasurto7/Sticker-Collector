import { groupByPage } from '../utils/group';

interface Props {
  ids: string[];
  selected: Set<string>;
  onToggle?: (id: string) => void;
  /** Map of sticker id → tooltip message for conflicted stickers. */
  conflicts?: Map<string, string>;
  /** Map of sticker id → copies. Anything >1 renders a "×N" badge on the chip. */
  quantities?: Map<string, number>;
  readOnly?: boolean;
}

/** Selectable sticker chips, grouped by page. Used in swap create / detail / close. */
export default function StickerChips({ ids, selected, onToggle, conflicts, quantities, readOnly }: Props) {
  const groups = groupByPage(ids);
  if (groups.length === 0) {
    return <p className="empty-note" style={{ padding: '6px 0' }}>Nothing here.</p>;
  }

  return (
    <div>
      {groups.map(({ page, stickers }) => (
        <div key={page.id} className="chip-group-row">
          <span className="chip-group-title">
            {page.emoji} {page.code}
          </span>
          <div className="chip-grid">
            {stickers.map((s) => {
              const isSel = selected.has(s.id);
              const conflictMsg = conflicts?.get(s.id);
              const qty = quantities?.get(s.id) ?? 1;
              const cls = ['chip'];
              if (isSel) cls.push('sel');
              if (conflictMsg) cls.push('conflict');
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cls.join(' ')}
                  onClick={() => !readOnly && onToggle?.(s.id)}
                  disabled={readOnly}
                  title={qty > 1 ? `${qty} copies` : undefined}
                >
                  {page.prefixNumbers ? page.code : ''}{s.number}
                  {qty > 1 && <span className="chip-qty">×{qty}</span>}
                  {conflictMsg && <span className="chip-warn" title={conflictMsg}>⚠️</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
