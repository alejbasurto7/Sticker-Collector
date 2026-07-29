import { coverTint, monogram } from '../utils/albumCover';

interface Props {
  id: string;
  name: string;
  /** Read-only joined member: a sticker "landing" here is a hand-off, never written. */
  viewOnly?: boolean;
  /** 'md' is the legend row; 'sm' (default) sits on a chip. */
  size?: 'sm' | 'md';
}

/**
 * An album's identity mark — the same tint and monogram as its AlbumCard cover.
 * Decorative-with-a-name: not focusable, so a chip stays one tab stop.
 */
export default function AlbumMark({ id, name, viewOnly, size = 'sm' }: Props) {
  const cls = ['amark', `tint-${coverTint(id)}`];
  if (size === 'md') cls.push('amark-md');
  if (viewOnly) cls.push('viewonly');
  return (
    <span className={cls.join(' ')} title={viewOnly ? `${name} — view-only` : name}>
      {monogram(name)}
    </span>
  );
}
