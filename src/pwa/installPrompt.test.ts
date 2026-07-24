import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  captureInstallPrompt,
  clearInstallPrompt,
  canInstall,
  promptInstall,
} from './installPrompt';

function makeFakeEvent() {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  };
}

describe('installPrompt store', () => {
  beforeEach(() => clearInstallPrompt());

  it('starts with no prompt available', () => {
    expect(canInstall()).toBe(false);
  });

  it('captures a prompt, suppresses the default banner, and offers install', () => {
    const e = makeFakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureInstallPrompt(e as any);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(canInstall()).toBe(true);
  });

  it('fires the native prompt and clears itself after promptInstall resolves', async () => {
    const e = makeFakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureInstallPrompt(e as any);
    await promptInstall();
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(canInstall()).toBe(false);
  });

  it('clearInstallPrompt makes install unavailable (the appinstalled path)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureInstallPrompt(makeFakeEvent() as any);
    clearInstallPrompt();
    expect(canInstall()).toBe(false);
  });

  it('promptInstall is a no-op when nothing was captured', async () => {
    await expect(promptInstall()).resolves.toBeUndefined();
  });
});
