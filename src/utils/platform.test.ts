import { describe, it, expect } from 'vitest';
import { parsePlatform } from './platform';

describe('parsePlatform', () => {
  it('detects iPhone as ios', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parsePlatform(ua)).toBe('ios');
  });

  it('detects a classic (pre-iPadOS-13) iPad as ios', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1';
    expect(parsePlatform(ua)).toBe('ios');
  });

  it('detects Android as android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    expect(parsePlatform(ua)).toBe('android');
  });

  it('classifies desktop Chrome on Windows as other', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(parsePlatform(ua)).toBe('other');
  });

  it('classifies an iPadOS-13+ Mac-style UA as other (wrapper corrects this at runtime)', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(parsePlatform(ua)).toBe('other');
  });
});
