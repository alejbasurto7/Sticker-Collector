import { groupByPage, labelFor } from '../utils/group';
import { describeBadge, type ChipBadge } from '../utils/chipBadges';
import AlbumMark from './AlbumMark';

interface Props {
  ids: string[];
  selected: Set<string>;
  onToggle?: (id: string) => void;
  /** Map of sticker id → tooltip message for conflicted stickers. */
  conflicts?: Map<string, string>;
  /** Map of sticker id → copies. Anything >1 renders a "×N" badge on the chip. */
  quantities?: Map<string, number>;
  /**
   * Group mode only: sticker id → which albums this copy leaves from / lands in.
   * Absent on every solo swap, where chips render exactly as they always have.
   */
  badges?: Map<string, ChipBadge>;
  readOnly?: boolean;
}

/** Selectable sticker chips, grouped by page. Used in swap create / detail / close. */
export default function StickerChips({
  ids,
  selected,
  onToggle,
  conflicts,
  quantities,
  badges,
  readOnly,
}: Props) {
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
              const badge = badges?.get(s.id);
              const cls = ['chip'];
              if (isSel) cls.push('sel');
              if (conflictMsg) cls.push('conflict');
              if (badge) cls.push('badged');
              if (badge?.ambiguous) cls.push('amb');
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cls.join(' ')}
                  onClick={() => !readOnly && onToggle?.(s.id)}
                  disabled={readOnly}
                  title={qty > 1 ? `${qty} copies` : undefined}
                  aria-label={badge ? `${labelFor(s.id)}, ${describeBadge(badge, qty)}` : undefined}
                >
                  {page.prefixNumbers ? page.code : ''}{s.number}
                  {qty > 1 && <span className="chip-qty">×{qty}</span>}
                  {badge && (
                    <span className="badge-row">
                      {badge.marks.map((m) => (
                        <AlbumMark key={m.id} {...m} />
                      ))}
                      {badge.handoffs.map((m) => (
                        <AlbumMark key={`h-${m.id}`} {...m} viewOnly />
                      ))}
                      {badge.ambiguous && <span className="amark ghost">?</span>}
                    </span>
                  )}
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
