/**
 * Lightweight, dependency-free confetti burst. Spawns a transient full-screen
 * canvas that paints falling, tumbling paper bits, then removes itself when the
 * animation settles. The canvas is `pointer-events: none`, so it never blocks
 * taps, typing, or scrolling underneath — the celebration stays out of the way.
 */

const COLORS = ['#f5c542', '#18b563', '#3b82f6', '#e0533d', '#ff7ab6', '#9b5de5', '#ffffff'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  color: string;
  rot: number;
  vrot: number;
  drift: number;
  phase: number;
}

/** True when the user has asked the OS to minimize motion. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fire a celebratory confetti burst. No-op (and honors the user's wishes) when
 * reduced motion is preferred. Safe to call repeatedly; each call is isolated.
 */
export function fireConfetti(count = 130): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  let w = window.innerWidth;
  let h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  // Two side cannons firing toward the centre-top for a fountain effect.
  const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const originX = fromLeft ? w * 0.08 : w * 0.92;
    const aim = fromLeft ? 1 : -1;
    return {
      x: originX,
      y: h * 0.78,
      vx: aim * (4 + Math.random() * 6),
      vy: -(9 + Math.random() * 7),
      g: 0.22 + Math.random() * 0.12,
      size: 6 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      drift: 0.6 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
    };
  });

  const start = performance.now();
  const MAX_MS = 2600;
  let raf = 0;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };

  const frame = (t: number) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w, h);

    for (const p of pieces) {
      p.vy += p.g;
      p.x += p.vx + Math.sin(p.phase + elapsed * 0.004) * p.drift;
      p.y += p.vy;
      p.rot += p.vrot;
      // Air resistance so horizontal cannon shots ease out.
      p.vx *= 0.99;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / MAX_MS);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < MAX_MS) {
      raf = requestAnimationFrame(frame);
    } else {
      cleanup();
    }
  };

  raf = requestAnimationFrame(frame);
}
