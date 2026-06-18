import { describe, it, expect } from 'vitest';
import { TEMPLATES, templateFor } from './layouts';
import { bindTemplate } from './layoutGeometry';
import { album } from './sampleAlbum';

const pageById = (id: string) => album.pages.find((p) => p.id === id)!;
const countSlots = (id: string) =>
  TEMPLATES[id].pages.reduce((n, p) => n + p.slots.length, 0);
const countReal = (id: string) =>
  TEMPLATES[id].pages.reduce(
    (n, p) => n + p.slots.filter((s) => !s.decorative).length,
    0,
  );

describe('templateFor', () => {
  it('returns the shared country template for every team page', () => {
    const mex = templateFor(pageById('MEX'))!;
    const bra = templateFor(pageById('BRA'))!;
    expect(mex.id).toBe('country-spread');
    expect(mex).toBe(bra); // one shared template instance
  });

  it('maps each non-country section to its template', () => {
    expect(templateFor(pageById('FWC-trophy'))!.id).toBe('fwc-specials');
    expect(templateFor(pageById('FWC-world'))!.id).toBe('fwc-ball-countries');
    expect(templateFor(pageById('FWC-scroll'))!.id).toBe('fwc-history');
  });
});

describe('templates bind to their real sections', () => {
  it('country spread has 20 real slots and a landscape sticker 13', () => {
    expect(countReal('country-spread')).toBe(20);
    // 13 is the 13th real slot -> page 2, after 10 on page 1.
    const land = TEMPLATES['country-spread'].pages
      .flatMap((p) => p.slots)
      .filter((s) => s.orientation === 'landscape');
    expect(land).toHaveLength(1);
  });

  it('Specials places 00,1,2,3 landscape and 4 portrait', () => {
    const t = TEMPLATES['fwc-specials'];
    const slots = t.pages.flatMap((p) => p.slots);
    expect(slots.map((s) => s.orientation)).toEqual([
      'landscape', // 00
      'landscape', // 1
      'landscape', // 2
      'landscape', // 3
      'portrait', // 4
    ]);
    // Every real slot binds to a Specials sticker, none unplaced.
    const bound = bindTemplate(t, pageById('FWC-trophy').stickerIds);
    expect(bound.unplaced).toEqual([]);
  });

  it('History folios 10-14 are landscape and the pre-printed photos are decorative', () => {
    const t = TEMPLATES['fwc-history'];
    const slots = t.pages.flatMap((p) => p.slots);
    const decorative = slots.filter((s) => s.decorative);
    expect(decorative.length).toBeGreaterThan(0);
    expect(decorative.every((s) => s.orientation === 'landscape')).toBe(true);
    // The 11 folios all bind; decorative photos are skipped.
    const bound = bindTemplate(t, pageById('FWC-scroll').stickerIds);
    expect(bound.unplaced).toEqual([]);
  });
});
