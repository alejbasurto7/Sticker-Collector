import { describe, it, expect } from 'vitest';
import { templatesToJSON, templatesToSource, albumTypesToJSON, albumTypesToSource } from './serializeTemplates';
import { TEMPLATES } from '../data/layouts';
import { ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID } from '../data/albumTypes';

describe('templatesToJSON', () => {
  it('round-trips the registry exactly through JSON', () => {
    const json = templatesToJSON(TEMPLATES);
    expect(JSON.parse(json)).toEqual(TEMPLATES);
  });
});

describe('templatesToSource', () => {
  it('wraps the JSON in a pasteable TEMPLATES declaration', () => {
    const src = templatesToSource(TEMPLATES);
    expect(src).toContain('export const TEMPLATES');
    expect(src).toContain('country-spread');
    // The JSON payload is embedded verbatim.
    expect(src).toContain(templatesToJSON(TEMPLATES));
  });
});

describe('albumTypesToJSON', () => {
  it('round-trips the album-type registry through JSON', () => {
    const json = albumTypesToJSON(ALBUM_TYPES);
    expect(JSON.parse(json)).toEqual(ALBUM_TYPES);
  });
});

describe('albumTypesToSource', () => {
  it('emits pasteable ALBUM_TYPES + ACTIVE_ALBUM_TYPE_ID declarations', () => {
    const src = albumTypesToSource(ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID);
    expect(src).toContain('export const ALBUM_TYPES');
    expect(src).toContain('export const ACTIVE_ALBUM_TYPE_ID = "2026-fwc"');
    expect(src).toContain('2026-fwc');
    expect(src).toContain(albumTypesToJSON(ALBUM_TYPES));
  });
});
