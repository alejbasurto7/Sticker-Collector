import { describe, it, expect } from 'vitest';
import {
  parseNumbers, fillNumbers, parseBulkLines, uniqueId, blankTemplate, newAlbumType,
  addVariant, updateVariant, removeVariant, setDefaultVariant,
  addSection, updateSection, deleteSection, moveSection, bulkAddSections,
  newTemplate, cloneTemplate, deleteTemplate, copyTemplateToType,
} from './registryOps';
import type { AlbumType } from '../data/albumTypes';

const T = (): AlbumType => newAlbumType('demo', 'Demo');

describe('parsing helpers', () => {
  it('parseNumbers trims and drops empties', () => {
    expect(parseNumbers(' 1, 2 ,,3 ')).toEqual(['1', '2', '3']);
  });
  it('fillNumbers builds 1..N', () => {
    expect(fillNumbers(4)).toEqual(['1', '2', '3', '4']);
    expect(fillNumbers(0)).toEqual([]);
  });
  it('parseBulkLines splits code/emoji/title and skips blanks', () => {
    expect(parseBulkLines('MEX, 🇲🇽, Mexico\n\nUSA, 🇺🇸, United States')).toEqual([
      { code: 'MEX', emoji: '🇲🇽', title: 'Mexico' },
      { code: 'USA', emoji: '🇺🇸', title: 'United States' },
    ]);
  });
  it('uniqueId suffixes on collision', () => {
    expect(uniqueId('x', [])).toBe('x');
    expect(uniqueId('x', ['x'])).toBe('x-2');
    expect(uniqueId('x', ['x', 'x-2'])).toBe('x-3');
  });
});

describe('album type + variants', () => {
  it('newAlbumType has one default variant and no sections', () => {
    const t = T();
    expect(t.variants).toEqual([{ id: 'base', label: 'Base' }]);
    expect(t.defaultVariant).toBe('base');
    expect(t.sections).toEqual([]);
    expect(t.templates).toEqual({});
  });
  it('addVariant uniquifies the id; removeVariant reassigns default and trims overrides', () => {
    let t = addVariant(T(), { id: 'na', label: 'NA' });
    t = addVariant(t, { id: 'na', label: 'NA2' }); // collides
    expect(t.variants.map((v) => v.id)).toEqual(['base', 'na', 'na-2']);
    t = setDefaultVariant(t, 'na');
    t = addSection(t);
    const sid = t.sections[0].id;
    t = updateSection(t, sid, { numbersByVariant: { na: ['1'] } });
    t = removeVariant(t, 'na');
    expect(t.variants.map((v) => v.id)).toEqual(['base', 'na-2']);
    expect(t.defaultVariant).toBe('base'); // default moved off the removed variant
    expect(t.sections[0].numbersByVariant).toEqual({}); // 'na' override dropped
  });
  it('removeVariant refuses to drop the last variant', () => {
    expect(removeVariant(T(), 'base')).toEqual(T());
  });
});

describe('sections', () => {
  it('addSection appends with a unique id and the first template', () => {
    let t = newTemplate(T(), 'tpl');
    t = addSection(t);
    expect(t.sections).toHaveLength(1);
    expect(t.sections[0].templateId).toBe('tpl');
    t = addSection(t);
    expect(t.sections.map((s) => s.id)).toEqual(['section', 'section-2']);
  });
  it('updateSection patches fields but keeps id stable', () => {
    let t = addSection(T());
    const id = t.sections[0].id;
    t = updateSection(t, id, { title: 'Mexico', numbers: ['1', '2'] });
    expect(t.sections[0].title).toBe('Mexico');
    expect(t.sections[0].numbers).toEqual(['1', '2']);
    expect(t.sections[0].id).toBe(id);
  });
  it('deleteSection removes by id', () => {
    const t = addSection(T());
    expect(deleteSection(t, t.sections[0].id).sections).toEqual([]);
  });
  it('moveSection reorders (clamped)', () => {
    let t = bulkAddSections(T(), parseBulkLines('A,,\nB,,\nC,,'),
      { templateId: '', numbers: [], foils: [], type: 'team' });
    expect(t.sections.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    t = moveSection(t, 2, 0);
    expect(t.sections.map((s) => s.id)).toEqual(['C', 'A', 'B']);
    t = moveSection(t, 0, 99); // clamps to last
    expect(t.sections.map((s) => s.id)).toEqual(['A', 'B', 'C']);
  });
  it('bulkAddSections makes one section per line sharing template + numbers', () => {
    const t = bulkAddSections(T(), parseBulkLines('MEX, 🇲🇽, Mexico\nUSA, 🇺🇸, United States'),
      { templateId: 'country-spread', numbers: fillNumbers(20), foils: ['1'], type: 'team' });
    expect(t.sections.map((s) => s.id)).toEqual(['MEX', 'USA']);
    expect(t.sections[0]).toMatchObject({
      code: 'MEX', emoji: '🇲🇽', title: 'Mexico', templateId: 'country-spread', foils: ['1'], type: 'team',
    });
    expect(t.sections[0].numbers).toHaveLength(20);
  });
});

describe('templates', () => {
  it('blankTemplate is one empty page at standard geometry', () => {
    const t = blankTemplate('x');
    expect(t.id).toBe('x');
    expect(t.pages).toEqual([{ slots: [] }]);
  });
  it('newTemplate / cloneTemplate / deleteTemplate handle collisions', () => {
    let t = newTemplate(T(), 'a');
    expect(Object.keys(t.templates)).toEqual(['a']);
    t = newTemplate(t, 'a'); // collide
    expect(Object.keys(t.templates)).toEqual(['a', 'a-2']);
    t = cloneTemplate(t, 'a', 'a'); // collide -> a-3
    expect(Object.keys(t.templates)).toEqual(['a', 'a-2', 'a-3']);
    expect(t.templates['a-3'].id).toBe('a-3');
    t = deleteTemplate(t, 'a-2');
    expect(Object.keys(t.templates)).toEqual(['a', 'a-3']);
  });
  it('copyTemplateToType duplicates across types with a non-colliding id', () => {
    const from = newTemplate(newAlbumType('from', 'From'), 'shared');
    const to = newTemplate(newAlbumType('to', 'To'), 'shared'); // target already has 'shared'
    const reg = { from, to };
    const { types, newId } = copyTemplateToType(reg, 'from', 'shared', 'to');
    expect(newId).toBe('shared-2');
    expect(Object.keys(types.to.templates)).toEqual(['shared', 'shared-2']);
    expect(types.to.templates['shared-2']).not.toBe(types.from.templates['shared']); // independent copy
    expect(types.from).toBe(reg.from); // source type untouched
  });
});
