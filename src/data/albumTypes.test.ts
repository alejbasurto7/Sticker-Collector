import { describe, it, expect } from 'vitest';
import { buildAlbumFromType, editionInfoFor, orderedSectionsFor, type AlbumType, activeType, templateFor, pagesSupportPages } from './albumTypes';
import { album } from './sampleAlbum';

const FIXTURE: AlbumType = {
  id: 'demo',
  name: 'Demo',
  variants: [
    { id: 'na', label: 'NA', region: 'na-region' },
    { id: 'latam', label: 'LATAM', region: 'latam-region' },
  ],
  defaultVariant: 'latam',
  templates: {},
  sections: [
    { id: 'A', code: 'A', emoji: '🅰️', title: 'Alpha', type: 'team', templateId: 't', numbers: ['1', '2'], foils: ['1'] },
    { id: 'X', code: 'X', emoji: '❌', title: 'Extra', type: 'extra', templateId: 't', optional: true,
      numbers: ['1', '2', '3'], foils: [], numbersByVariant: { na: ['1', '2'] } },
  ],
};

describe('buildAlbumFromType', () => {
  it('builds pages + stickers in section order with foil flags', () => {
    const album = buildAlbumFromType(FIXTURE, { variant: 'latam', enabledOptional: [] });
    expect(album.pages.map((p) => p.id)).toEqual(['A']); // optional X skipped
    expect(album.stickers.map((s) => s.id)).toEqual(['A-1', 'A-2']);
    expect(album.stickers.find((s) => s.id === 'A-1')!.special).toBe(true);
    expect(album.stickers.find((s) => s.id === 'A-2')!.special).toBe(false);
  });

  it('includes an optional section only when enabled, honouring numbersByVariant', () => {
    const latam = buildAlbumFromType(FIXTURE, { variant: 'latam', enabledOptional: ['X'] });
    expect(latam.pages.find((p) => p.id === 'X')!.stickerIds).toEqual(['X-1', 'X-2', 'X-3']);
    const na = buildAlbumFromType(FIXTURE, { variant: 'na', enabledOptional: ['X'] });
    expect(na.pages.find((p) => p.id === 'X')!.stickerIds).toEqual(['X-1', 'X-2']);
  });
});

describe('editionInfoFor', () => {
  it('derives label/region per variant; ccCount is 0 without a CC section', () => {
    const info = editionInfoFor(FIXTURE);
    expect(info.na).toEqual({ label: 'NA', region: 'na-region', ccCount: 0 });
    expect(info.latam.label).toBe('LATAM');
  });
});

const liveAlbum = (variant: string, trackCC: boolean) =>
  buildAlbumFromType(activeType, { variant, enabledOptional: trackCC ? ['CC'] : [] });

describe('2026-fwc definition (regression vs. today)', () => {
  it('orders sections per edition — CC last for na, mid-album for latam', () => {
    // na (default): base team order with the optional CC appended at the very end.
    const na = orderedSectionsFor(activeType, 'na').map((s) => s.id);
    expect(na.slice(0, 3)).toEqual(['FWC-trophy', 'FWC-world', 'MEX']);
    expect(na[na.length - 2]).toBe('FWC-scroll');
    expect(na[na.length - 1]).toBe('CC');
    // latam (International): CC moves mid-album — right after TUN, before BEL —
    // while the History scroll stays last.
    const latam = orderedSectionsFor(activeType, 'latam').map((s) => s.id);
    expect(latam[latam.indexOf('TUN') + 1]).toBe('CC');
    expect(latam[latam.indexOf('CC') + 1]).toBe('BEL');
    expect(latam[latam.length - 1]).toBe('FWC-scroll');
  });

  it('reproduces base totals and per-edition CC', () => {
    expect(liveAlbum('latam', false).stickers).toHaveLength(980);
    expect(liveAlbum('na', true).stickers).toHaveLength(992);
    expect(liveAlbum('latam', true).stickers).toHaveLength(994);
  });

  it('keeps the foil flags (team crest #1, all intro stickers, no CC foils)', () => {
    const a = liveAlbum('latam', true);
    const byId = Object.fromEntries(a.stickers.map((s) => [s.id, s]));
    expect(byId['MEX-1'].special).toBe(true);
    expect(byId['MEX-2'].special).toBe(false);
    expect(byId['FWC-trophy-00'].special).toBe(true);
    expect(byId['CC-1'].special).toBe(false);
  });
});

describe('templateFor', () => {
  const pageOf = (id: string) => liveAlbum('latam', true).pages.find((p) => p.id === id)!;
  const pageOfNa = (id: string) => liveAlbum('na', true).pages.find((p) => p.id === id)!;

  it('shares one country-spread instance across teams', () => {
    expect(templateFor(pageOf('MEX'))).toBe(templateFor(pageOf('BRA')));
    expect(templateFor(pageOf('MEX'))!.id).toBe('country-spread');
  });

  it('maps non-country sections to their templates', () => {
    expect(templateFor(pageOf('FWC-trophy'))!.id).toBe('fwc-specials');
    expect(templateFor(pageOf('FWC-scroll'))!.id).toBe('fwc-history');
  });

  it('uses cc-latam only at 14 stickers; NA(12) falls back to the flow grid', () => {
    expect(templateFor(pageOf('CC'))!.id).toBe('cc-latam');
    expect(templateFor(pageOfNa('CC'))).toBeUndefined();
  });
});

describe('pagesSupportPages', () => {
  it('is true for the active album (it has templated pages)', () => {
    expect(pagesSupportPages(album.pages)).toBe(true);
  });

  it('is false when no page maps to a template', () => {
    const orphan = {
      id: 'no-such-section',
      code: 'N',
      emoji: '❓',
      title: 'Nope',
      type: 'team' as const,
      stickerIds: ['1'],
    };
    expect(pagesSupportPages([orphan])).toBe(false);
  });
});

describe('orderedSectionsFor', () => {
  const base: AlbumType = {
    id: 'demo', name: 'Demo',
    variants: [{ id: 'na', label: 'NA' }, { id: 'latam', label: 'LATAM' }],
    defaultVariant: 'na', templates: {},
    sections: [
      { id: 'A', code: 'A', emoji: '', title: 'A', type: 'team', templateId: '', numbers: [], foils: [] },
      { id: 'B', code: 'B', emoji: '', title: 'B', type: 'team', templateId: '', numbers: [], foils: [] },
      { id: 'C', code: 'C', emoji: '', title: 'C', type: 'team', templateId: '', numbers: [], foils: [] },
    ],
  };

  it('returns the base sections (same array) when the variant has no override', () => {
    expect(orderedSectionsFor(base, 'na')).toBe(base.sections);
  });

  it('applies a full override order', () => {
    const t = { ...base, sectionOrder: { latam: ['C', 'A', 'B'] } };
    expect(orderedSectionsFor(t, 'latam').map((s) => s.id)).toEqual(['C', 'A', 'B']);
    expect(orderedSectionsFor(t, 'na').map((s) => s.id)).toEqual(['A', 'B', 'C']); // other variant untouched
  });

  it('appends sections missing from a partial override, in base order', () => {
    const t = { ...base, sectionOrder: { latam: ['C'] } };
    expect(orderedSectionsFor(t, 'latam').map((s) => s.id)).toEqual(['C', 'A', 'B']);
  });

  it('drops unknown ids and dedupes repeated ids', () => {
    const t = { ...base, sectionOrder: { latam: ['Z', 'B', 'B', 'A'] } };
    expect(orderedSectionsFor(t, 'latam').map((s) => s.id)).toEqual(['B', 'A', 'C']);
  });

  it('treats an empty override as no override (base order, same reference)', () => {
    const t = { ...base, sectionOrder: { latam: [] } };
    expect(orderedSectionsFor(t, 'latam')).toBe(base.sections);
  });
});

describe('buildAlbumFromType — per-variant order', () => {
  const t: AlbumType = {
    id: 'demo', name: 'Demo',
    variants: [{ id: 'na', label: 'NA' }, { id: 'latam', label: 'LATAM' }],
    defaultVariant: 'na', templates: {},
    sections: [
      { id: 'A', code: 'A', emoji: '', title: 'A', type: 'team', templateId: '', numbers: ['1'], foils: [] },
      { id: 'B', code: 'B', emoji: '', title: 'B', type: 'team', templateId: '', numbers: ['1'], foils: [] },
      { id: 'X', code: 'X', emoji: '', title: 'X', type: 'extra', templateId: '', optional: true, numbers: ['1'], foils: [] },
    ],
    sectionOrder: { latam: ['B', 'X', 'A'] },
  };

  it('builds pages in the variant-specific order', () => {
    expect(buildAlbumFromType(t, { variant: 'na', enabledOptional: ['X'] }).pages.map((p) => p.id))
      .toEqual(['A', 'B', 'X']);
    expect(buildAlbumFromType(t, { variant: 'latam', enabledOptional: ['X'] }).pages.map((p) => p.id))
      .toEqual(['B', 'X', 'A']);
  });

  it('still excludes an optional section when not enabled, regardless of order', () => {
    expect(buildAlbumFromType(t, { variant: 'latam', enabledOptional: [] }).pages.map((p) => p.id))
      .toEqual(['B', 'A']); // X (optional) dropped; remaining kept in override order
  });
});
