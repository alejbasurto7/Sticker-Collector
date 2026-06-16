import { toPng } from 'html-to-image';

/** Rasterize a DOM node to a PNG and share it (Web Share API) or download it. */
export async function shareNodeAsImage(node: HTMLElement, fileName = 'figuritas-stats.png'): Promise<void> {
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
      await nav.share({ files: [file], title: 'My Figuritas Stats' });
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
