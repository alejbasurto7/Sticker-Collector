import { toPng } from 'html-to-image';
import { APP_NAME } from '../config';

/** Rasterize a DOM node to a PNG and share it (Web Share API) or download it. */
export async function shareNodeAsImage(node: HTMLElement, fileName = 'sticker-collector-stats.png'): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#0f1115',
  });

  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], fileName, { type: 'image/png' });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `My ${APP_NAME} Stats` });
      return;
    } catch {
      // User cancelled or share failed — fall through to download.
    }
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

/** Copy text to the clipboard, falling back to a hidden textarea on older browsers. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context — fall through to the legacy path.
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
