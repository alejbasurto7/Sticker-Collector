// App version metadata, baked in at build time via Vite's `define`
// (see vite.config.ts). The commit hash + build time make every deploy
// uniquely identifiable, so you can confirm exactly which build is running.
export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;
export const APP_BUILD_TIME = __APP_BUILD_TIME__;

// Compact UTC date for display, e.g. "2026-06-18 14:32 UTC".
function formatBuildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${date} ${time} UTC`;
}

// e.g. "v1.0.0 · a1b3c9d · 2026-06-18 14:32 UTC"
export const VERSION_LABEL = `v${APP_VERSION} · ${APP_COMMIT} · ${formatBuildTime(APP_BUILD_TIME)}`;
