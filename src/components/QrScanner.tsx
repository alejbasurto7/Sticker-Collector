import { useEffect, useRef } from 'react';
import jsQR from 'jsqr';

interface Props {
  /** Called with the decoded QR text the first time a code is read. */
  onResult: (text: string) => void;
  /** Called if the camera can't be opened (permission denied / no camera). */
  onError?: () => void;
}

/**
 * Live camera QR scanner. Opens the rear camera, scans each frame with jsQR,
 * and fires onResult on the first decode. Fully self-cleaning: the stream and
 * animation loop are torn down on unmount. Manual code entry is always offered
 * alongside this (see SyncDialog) for when the camera is unavailable.
 */
export default function QrScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const canvas = document.createElement('canvas');

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = () => {
          if (cancelled) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const result = jsQR(img.data, img.width, img.height);
              if (result?.data) {
                onResult(result.data);
                return; // stop scanning; parent will unmount us
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) onError?.();
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onResult/onError are stable enough for this one-shot scanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <video ref={videoRef} className="qr-video" muted playsInline />;
}
