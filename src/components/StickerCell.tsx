import { useRef } from 'react';
import type { Sticker } from '../types';

interface Props {
  sticker: Sticker;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}

const LONG_PRESS_MS = 450;

export default function StickerCell({ sticker, count, onAdd, onRemove }: Props) {
  const timer = useRef<number | null>(null);
  // Set when a long-press fires so the click the browser still synthesizes on
  // release doesn't also add a sticker.
  const suppressClick = useRef(false);

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
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onAdd();
  };

  const onPointerDown = () => {
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

  const owned = count >= 1;
  const swaps = count > 1 ? count - 1 : 0;

  const cls = ['cell'];
  if (owned) cls.push('owned');
  if (sticker.special) cls.push('special');

  return (
    <div
      className={cls.join(' ')}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      aria-label={`Sticker ${sticker.number}, ${owned ? 'owned' : 'missing'}${
        swaps ? `, ${swaps} swaps` : ''
      }`}
    >
      {sticker.number}
      {sticker.special && <span className="star">★</span>}
      {swaps > 0 && <span className="swap-badge">+{swaps}</span>}
    </div>
  );
}
