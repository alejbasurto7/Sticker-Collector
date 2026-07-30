/** WCAG 2.1 relative luminance / contrast, used to keep the album mark legible at chip size. */

function channelToLinear(srgb8: number): number {
  const s = srgb8 / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of a `#rgb` or `#rrggbb` colour, per WCAG 2.1. Throws on anything
 * else: an unparsed colour used to come back as NaN, and every comparison against NaN is
 * false — so a bad input would read as a contrast failure rather than the mistake it is.
 */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (
    0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
  );
}

/** Contrast ratio between two `#rrggbb` colours: 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
