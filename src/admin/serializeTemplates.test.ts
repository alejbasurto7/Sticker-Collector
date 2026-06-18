import { describe, it, expect } from 'vitest';
import { templatesToJSON, templatesToSource } from './serializeTemplates';
import { TEMPLATES } from '../data/layouts';

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
