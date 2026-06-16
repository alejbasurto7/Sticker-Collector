import { groupByPage } from '../utils/group';

interface Props {
  ids: string[];
  selected: Set<string>;
  onToggle?: (id: string) => void;
  conflicts?: Set<string>;
  readOnly?: boolean;
}

/** Selectable sticker chips, grouped by page. Used in swap create / detail / close. */
export default function StickerChips({ ids, selected, onToggle, conflicts, readOnly }: Props) {
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
              const isConflict = conflicts?.has(s.id);
              const cls = ['chip'];
              if (isSel) cls.push('sel');
              if (isConflict) cls.push('conflict');
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cls.join(' ')}
                  onClick={() => !readOnly && onToggle?.(s.id)}
                  disabled={readOnly}
                >
                  {s.number}
                  {isConflict && <span className="chip-warn" title="Already promised in another swap">⚠️</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
