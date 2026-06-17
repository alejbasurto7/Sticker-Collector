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
  // Tracks an in-flight press so a dropped pointerup (e.g. the browser reclaims
  // the gesture for scrolling and fires pointercancel) can't leave a stale
  // long-press timer armed or double-handle a single tap.
  const pressing = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    longFired.current = false;
    pressing.current = true;
    // Bind the whole gesture to this cell. Without capture, the `:active`
    // scale(0.92) shrinks the cell out from under a fingertip that landed near
    // its edge, so the finger ends up over a neighbouring cell and the matching
    // pointerup never returns here — silently dropping the tap. Capturing keeps
    // pointerup/pointercancel anchored to the cell the press started on.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is unsupported in some environments; the tap still works without it */
    }
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      onRemove();
    }, LONG_PRESS_MS);
  };

  const onPointerUp = () => {
    if (!pressing.current) return;
    pressing.current = false;
    clear();
    // A short press (tap) that did not trigger the long-press → add one.
    if (!longFired.current) onAdd();
  };

  // The browser cancelled the gesture (scroll/zoom takeover, etc.). Abort the
  // pending long-press without adding or removing so the cell stays responsive.
  const onPointerCancel = () => {
    pressing.current = false;
    clear();
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
      onPointerCancel={onPointerCancel}
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
