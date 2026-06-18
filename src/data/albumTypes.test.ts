import { describe, it, expect } from 'vitest';
import { buildAlbumFromType, editionInfoFor, type AlbumType } from './albumTypes';

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
