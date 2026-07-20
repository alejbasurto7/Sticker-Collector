# Design: QR code on the Cloud sync screen

**Date:** 2026-07-20
**Status:** Approved (ready for implementation planning)

## Goal

Add a scannable QR code to the sync-code UI so a second device can link by
pointing its camera at the first device, instead of typing the 12-character
sync code by hand. Add a Share button next to it so the QR (plus the code as
text) can be sent through the native share sheet.

## Context

The app already has a full QR toolchain in place — no new dependencies:

- **Generation:** `qrcode` (`QRCode.toDataURL`), used in `SyncDialog.tsx`
  (create flow) and `AlbumSharing.tsx` (album shares).
- **Scanning:** `jsqr`, wrapped by `QrScanner.tsx`, consumed by
  `SyncDialog.handleScan`.
- **Payload contract:** QR encodes `sticker-sync:<CODE>` (prefix + unformatted
  12-char code). The scanner strips the `sticker-sync:` prefix and feeds the
  remainder into the existing join flow (`peekRemote` → link/join).

The one place that shows a persistent sync code but has **no** QR is the linked
state of `SyncSection.tsx` (the "Sync code" row with Reveal/Copy + "Unlink this
device"). `SyncSection` renders inside the "Cloud sync" dialog
(`SettingsDialog.tsx`) and inside the Library sync panel — the QR will appear in
both, which is intended.

## Decisions (confirmed with user)

1. **Always visible.** The QR renders whenever the device is linked, regardless
   of the code's Reveal/Hide state. The QR encodes the real secret even while
   the code text stays masked. (User accepted this trade-off over gating the QR
   behind Reveal.)
2. **Both surfaces.** The QR lives in `SyncSection`, so it shows in every context
   that mounts it (Cloud sync dialog + Library sync panel). No per-surface flag.
3. **Keep a caption.** A short helper line — "Scan on another device to link" —
   sits under the QR for discoverability.
4. **Extract `QR_PREFIX`.** The `'sticker-sync:'` constant is currently
   duplicated in `SyncDialog.tsx` and `AlbumSharing.tsx`. Rather than add a third
   copy, extract it once into `src/lib/syncCode.ts` and import it in all three
   generators (the scanner path already lives in `SyncDialog`). Kills drift risk
   on a shared contract.
5. **Share button — QR image + code text.** A Share button next to the QR opens
   the native share sheet (Web Share API) with **two** payload parts: the QR PNG
   as a file, plus a text line carrying the human-readable code
   (`Sync code: ZVJZ-8RGG-XZY6 — add it in <app> to link a device.`) so a
   recipient who can't scan can paste it into "Enter a code". The QR already
   encodes this secret, so the text adds no extra exposure. On desktop / browsers
   without file-share support, it falls back to downloading the QR PNG (the code
   text is dropped, but it's still visible on-screen with its own Copy button).

## Changes

### `src/lib/syncCode.ts`
- Export a new constant: `export const QR_PREFIX = 'sticker-sync:';`
- (Note: this is the same literal already used as the hash salt in
  `hashSyncCode`; that salt use is separate and stays inline — do not couple the
  two. Only the QR-payload prefix is being centralized.)

### `src/components/SyncDialog.tsx` and `src/components/AlbumSharing.tsx`
- Remove the local `const QR_PREFIX = 'sticker-sync:'`.
- Import `QR_PREFIX` from `../lib/syncCode`.
- No behavioral change (same string, same call sites).

### `src/utils/share.ts`
- Extract the data-URL → Blob → `File` → Web-Share-or-download tail of
  `shareNodeAsImage` into a reusable helper:
  ```ts
  export async function shareImage(
    dataUrl: string,
    opts: { fileName: string; title?: string; text?: string },
  ): Promise<void>
  ```
  It tries `navigator.canShare({ files })` → `navigator.share({ files, title, text })`,
  and on unsupported/cancel falls back to an `<a download>` click on the PNG.
- Refactor `shareNodeAsImage` to rasterize (unchanged) then delegate to
  `shareImage` — no behavior change for the existing stats-card share.

### `src/components/SyncSection.tsx` (the feature)
- Imports: add `useEffect` (already imports `useState`), `QRCode from 'qrcode'`,
  `QR_PREFIX` from `../lib/syncCode`, `shareImage` from `../utils/share`, and
  `APP_NAME` from `../config`.
- State: `const [qrUrl, setQrUrl] = useState('')`.
- Effect keyed on `code`:
  - If `code` is null → `setQrUrl('')` and return (unlinked / clears stale QR).
  - Else generate `QRCode.toDataURL(`${QR_PREFIX}${code}`, { margin: 1, width: 240 })`
    and store the data-URL in `qrUrl`.
  - Guard against stale async results with a `cancelled` flag in the effect
    cleanup; swallow generation errors by clearing `qrUrl` (fail soft — the code
    text + Copy still work).
- Share handler:
  ```ts
  async function handleShareQr() {
    if (!qrUrl || !code) return;
    await shareImage(qrUrl, {
      fileName: 'sticker-collector-sync.png',
      title: `${APP_NAME} sync`,
      text: `Sync code: ${code} — add it in ${APP_NAME} to link a device.`,
    });
  }
  ```
- Render: inside the existing `.settings-field`, immediately after the
  `.sync-code-row`, render when `qrUrl` is set:
  ```tsx
  {qrUrl && (
    <div className="sync-qr-block">
      <img className="sync-qr" src={qrUrl} alt="Sync code QR" />
      <p className="sync-qr-caption">Scan on another device to link</p>
      <button type="button" className="btn" onClick={() => void handleShareQr()}>
        Share
      </button>
    </div>
  )}
  ```
- Reuse the existing `.sync-qr` class (`styles.css:1698`) — already centered,
  white-padded, responsive. `max-width: 70%` keeps it modest inside the field.

### `src/styles.css`
- Add `.sync-qr-block` (centered column: `text-align: center` so the caption and
  Share button center under the QR image).
- Add `.sync-qr-caption` for the helper line (dim, small — mirrors `.sync-time` /
  `.modal-sub`). No changes to `.sync-qr`.

## Data flow

`syncStore.collection.code` → `SyncSection` derives `code` → `useEffect`
generates `sticker-sync:<code>` data-URL → `<img className="sync-qr">`. On a
second device: camera → `QrScanner` (jsqr) → `handleScan` strips `QR_PREFIX` →
existing `peekRemote`/link flow. No engine or store changes.

## Error handling

- QR generation is async and can reject; on rejection clear `qrUrl` so the UI
  degrades to code-text-only (Reveal/Copy unaffected). The Share button is only
  rendered when `qrUrl` is set, so it can't fire without an image.
- Effect cleanup cancels stale writes when `code` changes rapidly (e.g. link →
  unlink → relink).
- `shareImage` swallows a user-cancelled/failed `navigator.share` and falls
  through to the download path; a share of an already-linked device is idempotent
  and side-effect-free.

## Testing / verification

- No new business logic to unit-test (QR string is a pure concatenation of an
  existing prefix + existing code). The existing `syncCode` tests still cover
  code generation/format.
- Manual verification: link a device, confirm the QR appears in both the Cloud
  sync dialog and the Library sync panel, and confirm the in-app scanner on a
  second device reads it and enters the join flow.
- Share verification: on a mobile/PWA build tapping Share opens the native sheet
  with the QR PNG + code text; on a desktop browser without file-share it
  downloads `sticker-collector-sync.png`.
- Regression check: `SyncDialog` create flow and `AlbumSharing` still generate
  their QRs after the `QR_PREFIX` import swap; the stats-card `shareNodeAsImage`
  still shares/downloads after the `shareImage` extraction.

## Out of scope (YAGNI)

- No https/deep-link QR that opens the app from a native camera (the payload is
  the app's own custom scheme, read only by the in-app scanner). Revisit only if
  native-camera pairing is requested.
- No gating the QR behind Reveal (explicitly decided against).
- No separate "download QR" button — download is only the Share fallback when
  the Web Share API is unavailable.
- No copy-to-clipboard of the share text on the desktop fallback (the code is
  already on-screen with its own Copy button).
