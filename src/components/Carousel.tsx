import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  slides: ReactNode[];
  /** Accessible name for the carousel region. */
  ariaLabel: string;
  /** Fired when the user confirms the final slide (primary button reads `doneLabel`). */
  onDone?: () => void;
  /** Fired by an always-available secondary "Skip" action (hidden on the last slide). */
  onSkip?: () => void;
  /** Label for the final-slide primary action. */
  doneLabel?: string;
}

/**
 * A paged, accessible content carousel: a scroll-snap track paged one slide at a time
 * by previous/next buttons, a dot picker, and ← → keys. No auto-rotation (so no pause
 * control is required). Follows the WAI-ARIA carousel pattern — region + slide roles
 * with position labels — and honours prefers-reduced-motion via CSS.
 */
export default function Carousel({ slides, ariaLabel, onDone, onSkip, doneLabel = 'Got it' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const atEnd = index >= count - 1;

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    const track = trackRef.current;
    if (track) track.scrollTo({ left: track.clientWidth * next, behavior: 'smooth' });
    setIndex(next);
  }, [count]);

  // Keep the active index honest when the user free-scrolls / swipes the track.
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    setIndex((cur) => (i !== cur ? i : cur));
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
  };

  return (
    <div className="carousel">
      <div
        className="carousel-track"
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="carousel-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="carousel-controls">
        <button
          type="button"
          className="carousel-nav"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Previous slide"
        >
          ‹
        </button>
        <div className="carousel-dots" role="tablist" aria-label="Choose slide">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className="carousel-dot"
              role="tab"
              aria-label={`Slide ${i + 1}`}
              aria-selected={i === index}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="carousel-nav"
          onClick={() => goTo(index + 1)}
          disabled={atEnd}
          aria-label="Next slide"
        >
          ›
        </button>
      </div>

      <span className="sr-only" aria-live="polite">{`Slide ${index + 1} of ${count}`}</span>

      <div className="btn-row">
        {onSkip && !atEnd && (
          <button type="button" className="btn ghost" onClick={onSkip}>Skip</button>
        )}
        <button
          type="button"
          className="btn primary full"
          onClick={() => (atEnd ? onDone?.() : goTo(index + 1))}
        >
          {atEnd ? doneLabel : 'Next'}
        </button>
      </div>
    </div>
  );
}
