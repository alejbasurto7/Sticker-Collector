import { useSyncExternalStore } from 'react';

/**
 * The non-standard beforeinstallprompt event (Chromium only). Not in lib.dom, so we
 * declare the minimal shape we use.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

// --- store (no DOM access, so it is unit-testable in the Node env) ---

/** Stash a captured prompt and suppress Chrome's default mini-infobar. */
export function captureInstallPrompt(e: BeforeInstallPromptEvent): void {
  e.preventDefault();
  deferredPrompt = e;
  emit();
}

/** Forget any captured prompt (used on appinstalled and after the prompt is spent). */
export function clearInstallPrompt(): void {
  deferredPrompt = null;
  emit();
}

/** Whether a native install prompt is currently available. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Fire the stored native install prompt, then clear it (the event is single-use). */
export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  const evt = deferredPrompt;
  await evt.prompt();
  await evt.userChoice;
  clearInstallPrompt(); // beforeinstallprompt is single-use; Chrome re-fires later if still eligible
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// --- DOM wiring: registered at import time (from main.tsx) because
// beforeinstallprompt fires once, early — often before Settings is ever opened.
// Guarded so importing this module in the Node test env is a no-op.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) =>
    captureInstallPrompt(e as BeforeInstallPromptEvent),
  );
  window.addEventListener('appinstalled', clearInstallPrompt);
}

/** React binding: whether install is available, plus the trigger. */
export function useInstallPrompt(): {
  canPrompt: boolean;
  promptInstall: () => Promise<void>;
} {
  const canPrompt = useSyncExternalStore(subscribe, canInstall, () => false);
  return { canPrompt, promptInstall };
}
