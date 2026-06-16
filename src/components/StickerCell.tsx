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
  const longFired = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const onPointerDown = () => {
    longFired.current = false;
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      onRemove();
    }, LONG_PRESS_MS);
  };

  const onPointerUp = () => {
    clear();
    // A short press (tap) that did not trigger the long-press → add one.
    if (!longFired.current) onAdd();
  };

  const owned = count >= 1;
  const swaps = count > 1 ? count - 1 : 0;

  const cls = ['cell'];
  if (owned) cls.push('owned');
  if (sticker.special) cls.push('special');

  return (
    <div
      className={cls.join(' ')}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clear}
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
