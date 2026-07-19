/** First visible character of a name, uppercased, for the album monogram tile. */
export function monogram(name: string): string {
  const first = [...name.trim()][0]; // first code point → one glyph for letters or emoji
  return first ? first.toUpperCase() : '?';
}

/** Deterministic tint bucket from an album id, so a card/switcher colour is stable. */
export function coverTint(id: string, count = 6): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % count;
}
