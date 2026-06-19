import { useRef } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { Sticker } from '../types';

interface Props {
  sticker: Sticker;
  count: number;
  /** When true the album is locked: the cell is read-only and ignores taps. */
  locked?: boolean;
  /** Landscape (wide) cell — used by the album-spread layout for sticker 13. */
  landscape?: boolean;
  /**
   * Display-only code prefix (e.g. "CC") shown before the bare number when the
   * page opts in. The sticker id / export / import always use the bare number.
   */
  numberPrefix?: string;
  /** Inline grid placement, supplied by the album-spread layout. */
  style?: CSSProperties;
  onAdd: () => void;
  onRemove: () => void;
}

const LONG_PRESS_MS = 450;

export default function StickerCell({
  sticker,
  count,
  locked = false,
  landscape = false,
  numberPrefix = '',
  style,
  onAdd,
  onRemove,
}: Props) {
  const timer = useRef<number | null>(null);
  // Set when a long-press fires so the click the browser still synthesizes on
  // release doesn't also add a sticker.
  const suppressClick = useRef(false);
  // The pointer type that began the current interaction. Lets onContextMenu
  // tell a desktop right-click (decrement) apart from the native contextmenu a
  // touch long-press also raises (already handled by the timer below).
  const lastPointerType = useRef<string | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Adding is handled by the browser's own click event rather than a hand-rolled
  // pointerdown/pointerup pair. Click reliably targets the cell the press began
  // on even though `.cell:active` scales it down (which, with the old manual
  // pairing, could shrink the cell out from under a fingertip near its edge so
  // the matching pointerup never landed and the tap was silently dropped).
  const onClick = () => {
    if (locked) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onAdd();
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (locked) return;
    lastPointerType.current = e.pointerType;
    // Desktop decrements with a right-click (see onContextMenu); only touch and
    // pen use the press-and-hold gesture, so don't arm the timer for a mouse.
    if (e.pointerType === 'mouse') return;
    suppressClick.current = false;
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      suppressClick.current = true;
      onRemove();
    }, LONG_PRESS_MS);
  };

  // Any way the press ends (release, finger leaves, gesture cancelled) just
  // disarms the long-press; a genuine tap then falls through to onClick.
  const endPress = () => clear();

  const onContextMenu = (e: ReactMouseEvent) => {
    // Suppress the native menu on every device.
    e.preventDefault();
    if (locked) return;
    // Right-click is the desktop decrement gesture. A touch long-press can also
    // raise contextmenu, but that path already removes via the timer, so only
    // act on genuine mouse input here to avoid decrementing twice.
    if (lastPointerType.current !== 'mouse') return;
    onRemove();
  };

  const owned = count >= 1;
  const swaps = count > 1 ? count - 1 : 0;

  const cls = ['cell'];
  if (owned) cls.push('owned');
  if (sticker.special) cls.push('special');
  if (locked) cls.push('locked');
  if (landscape) cls.push('landscape');

  return (
    <div
      className={cls.join(' ')}
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={onContextMenu}
      role="button"
      aria-disabled={locked || undefined}
      aria-label={`Sticker ${numberPrefix}${sticker.number}, ${owned ? 'owned' : 'missing'}${
        swaps ? `, ${swaps} swaps` : ''
      }`}
    >
      {numberPrefix}{sticker.number}
      {sticker.special && <span className="star">★</span>}
      {swaps > 0 && <span className="swap-badge">+{swaps}</span>}
    </div>
  );
}
