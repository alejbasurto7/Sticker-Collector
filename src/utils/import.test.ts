import { describe, it, expect } from 'vitest';
import { parseExport } from './import';

describe('parseExport spare-count suffix', () => {
  it('reads "(x2)" — symbol before the digit', () => {
    const p = parseExport('To Swap\nMEX: 1 (x2), 9');
    expect(p.swaps).toContain('MEX-1');
    expect(p.swapQty['MEX-1']).toBe(2);
    expect(p.swapQty['MEX-9']).toBe(1); // bare number defaults to 1
  });

  it('reads "(2x)" — digit before the symbol', () => {
    const p = parseExport('To Swap\nMEX: 1 (2x), 9');
    expect(p.swaps).toContain('MEX-1');
    expect(p.swapQty['MEX-1']).toBe(2);
  });

  it('accepts no space, either order, and "×" or upper-case "X"', () => {
    const p = parseExport('To Swap\nMEX: 1(2x), 9(×3), BRA: 4(3X)');
    expect(p.swapQty['MEX-1']).toBe(2);
    expect(p.swapQty['MEX-9']).toBe(3);
    expect(p.swapQty['BRA-4']).toBe(3);
  });

  it('still requires the multiplier symbol — "(2)" is dropped', () => {
    const p = parseExport('To Swap\nMEX: 1(2), 9');
    expect(p.swaps).not.toContain('MEX-1'); // "1(2)" is not a plain digit
    expect(p.swaps).toContain('MEX-9');
  });
});

describe('parseExport label forms (flags / names / codes)', () => {
  it('resolves flag emoji, country name, code+flag, and bare code without colons', () => {
    const p = parseExport(
      [
        'I NEED:',
        '🇲🇽 1,11', // flag emoji, no colon, no spaces after commas
        'Congo DR 2,3,4,8,18', // country name (reversed word order vs "DR Congo")
        'GHA🇬🇭 16', // code glued to flag
        'FWC 1,2,5,14,16', // bare code, FWC intro pages
        '🏴󠁧󠁢󠁳󠁣󠁴󠁿 3,5,12', // subdivision (Scotland) tag flag
        '🏴󠁧󠁢󠁥󠁮󠁧󠁿 2,9,13,16,', // England tag flag, trailing comma tolerated
      ].join('\n'),
    );
    expect(p.needs).toContain('MEX-1');
    expect(p.needs).toContain('MEX-11');
    expect(p.needs).toContain('COD-2'); // DR Congo
    expect(p.needs).toContain('COD-18');
    expect(p.needs).toContain('GHA-16');
    expect(p.needs).toContain('SCO-3'); // Scotland
    expect(p.needs).toContain('ENG-16'); // England
    // FWC intro numbers route to whichever intro page actually holds them.
    expect(p.needs).toContain('FWC-trophy-1');
    expect(p.needs).toContain('FWC-trophy-2');
    expect(p.needs).toContain('FWC-world-5');
    expect(p.unmatched).toHaveLength(0);
  });

  it('still resolves the legacy "CODE emoji: numbers" colon format', () => {
    const p = parseExport('I need\nMEX 🇲🇽: 1, 2');
    expect(p.needs).toEqual(expect.arrayContaining(['MEX-1', 'MEX-2']));
  });

  it('routes FWC numbers to the right intro page even when the emoji points elsewhere', () => {
    // The FWC intro pages share code "FWC" with distinct emojis and disjoint
    // number ranges (trophy 00–4, ball 5–8, history 9–19). A hand-typed list may
    // file every special under one emoji; the number must still win.
    const p = parseExport('To Swap\nFWC 🏆: 1, 6, 14');
    expect(p.swaps).toEqual(
      expect.arrayContaining(['FWC-trophy-1', 'FWC-world-6', 'FWC-scroll-14']),
    );
    expect(p.unmatched).toHaveLength(0);
  });

  it('keeps matching FWC lines whose emoji already fits the number', () => {
    const p = parseExport('To Swap\nFWC 🏆: 1\nFWC ⚽: 6\nFWC 🏅: 14');
    expect(p.swaps).toEqual(
      expect.arrayContaining(['FWC-trophy-1', 'FWC-world-6', 'FWC-scroll-14']),
    );
    expect(p.unmatched).toHaveLength(0);
  });

  it('still reports a genuinely out-of-range number as unmatched', () => {
    // 99 is not an FWC number under any intro page, so widening must not invent one.
    const p = parseExport('To Swap\nFWC 🏆: 99');
    expect(p.swaps).toHaveLength(0);
    expect(p.unmatched).toContain('FWC 🏆 99');
  });
});

describe('parseExport section headers', () => {
  it('recognizes "What I have" as a swap header', () => {
    const p = parseExport('I need\nMEX: 8\nWhat I have:\nCAN: 1(2x)');
    expect(p.needs).toContain('MEX-8'); // stays in needs
    expect(p.swaps).toContain('CAN-1'); // switched to swaps
    expect(p.swapQty['CAN-1']).toBe(2);
  });
});

describe('parseExport need quantities (needQty)', () => {
  it('captures "(×N)" copies on the need side and defaults bare numbers to 1', () => {
    const p = parseExport('I need\nMEX: 1 (×2), 9');
    expect(p.needs).toEqual(expect.arrayContaining(['MEX-1', 'MEX-9']));
    expect(p.needQty['MEX-1']).toBe(2);
    expect(p.needQty['MEX-9']).toBe(1);
  });

  it('sums repeats of the same needed sticker', () => {
    const p = parseExport('I need\nMEX: 1 (×2), 1');
    expect(p.needQty['MEX-1']).toBe(3);
  });

  it('only counts needs under a need header, not swaps', () => {
    const p = parseExport('To Swap\nMEX: 1 (×2)');
    expect(p.needQty['MEX-1']).toBeUndefined();
  });
});

describe('parseExport additive tally (all)', () => {
  it('counts every listed copy regardless of section, using (×N) quantities', () => {
    const p = parseExport('I need\nMEX: 8\nTo Swap\nCAN: 1(2x), 5');
    // Needs and swaps alike contribute their copies to the merge tally.
    expect(p.all['MEX-8']).toBe(1);
    expect(p.all['CAN-1']).toBe(2); // the (2x) suffix
    expect(p.all['CAN-5']).toBe(1);
  });

  it('sums repeats of the same sticker', () => {
    const p = parseExport('To Swap\nMEX: 1(2x), 1');
    expect(p.all['MEX-1']).toBe(3); // 2 + 1
  });

  it('tallies stickers listed with no section header at all', () => {
    const p = parseExport('MEX: 1, 2(×3)');
    // No header, so the Replace-facing lists stay empty…
    expect(p.needs).toHaveLength(0);
    expect(p.swaps).toHaveLength(0);
    // …but the additive tally still picks them up.
    expect(p.all['MEX-1']).toBe(1);
    expect(p.all['MEX-2']).toBe(3);
  });
});
