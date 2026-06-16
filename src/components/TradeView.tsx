import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { useCollection } from '../store/collectionStore';
import { buildExportText } from '../utils/qr';
import TradeHistory from './TradeHistory';
import NewSwapDialog from './NewSwapDialog';

export default function TradeView() {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrError, setQrError] = useState('');
  const [scanError, setScanError] = useState('');
  const [scannedText, setScannedText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastTrade = [...swaps]
    .filter((s) => s.status === 'closed')
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];

  // Generate QR code whenever the collection changes.
  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const text = buildExportText(counts);
    if (!text) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 240;
        canvas.height = 240;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 240, 240);
        ctx.fillStyle = '#9aa3b2';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Add stickers to', 120, 115);
        ctx.fillText('generate your QR code', 120, 133);
      }
      return;
    }
    setQrError('');
    QRCode.toCanvas(canvas, text, {
      width: 240,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch((err: Error) => {
      setQrError(`Could not generate QR: ${err.message}`);
    });
  }, [counts]);

  // Stop camera when scanning closes.
  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  const handleScannedValue = (value: string) => {
    stopCamera();
    setScanning(false);
    setScannedText(value);
  };

  // Camera scanning via jsQR — works in all browsers.
  const startCamera = async () => {
    setScanError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setScanError('Camera access denied. Use "Upload QR image" instead.');
    }
  };

  // Once video is in the DOM and playing, start scanning frames with jsQR.
  const onVideoReady = () => {
    const tick = () => {
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || !streamRef.current) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(img.data, img.width, img.height);
      if (result) {
        handleScannedValue(result.data);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // File upload — draw image to canvas and decode with jsQR.
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setScanError('');

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if (result) {
        handleScannedValue(result.data);
      } else {
        setScanError('No QR code found in the image.');
      }
    };
    img.onerror = () => setScanError('Could not read that image.');
  };

  const cancelScan = () => {
    stopCamera();
    setScanning(false);
  };

  return (
    <div className="trade-view">
      {/* History button row */}
      <div className="trade-top-bar">
        <button
          className="icon-btn"
          onClick={() => setHistoryOpen(true)}
          aria-label="Trade history"
          title={lastTrade ? 'View last trade' : 'No trades yet'}
        >
          🕐
        </button>
      </div>

      {/* QR / camera area */}
      <div className="trade-qr-wrap">
        {scanning ? (
          <div className="trade-scanner">
            <video
              ref={videoRef}
              className="trade-video"
              playsInline
              muted
              autoPlay
              onCanPlay={onVideoReady}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                v.srcObject = streamRef.current;
                v.play();
              }}
            />
            {/* Hidden canvas used to capture video frames for jsQR */}
            <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
            <button className="btn trade-cancel-scan" onClick={cancelScan}>
              Cancel
            </button>
          </div>
        ) : (
          <canvas ref={qrCanvasRef} className="trade-qr-canvas" />
        )}
      </div>

      {qrError && <p className="trade-scan-error">{qrError}</p>}
      {scanError && <p className="trade-scan-error">{scanError}</p>}

      {/* Instructions */}
      <ol className="trade-instructions">
        <li>Scan your friend's QR code to discover which stickers you can swap.</li>
        <li>Let your friend scan the QR code you're showing to update their album.</li>
        <li>Exchange the traded stickers.</li>
      </ol>

      {/* Action buttons */}
      <button className="btn primary full trade-scan-btn" onClick={startCamera}>
        <span>⬚</span> Scan
      </button>

      <button className="btn-text" onClick={() => fileInputRef.current?.click()}>
        Upload QR image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {historyOpen && <TradeHistory onClose={() => setHistoryOpen(false)} />}

      {scannedText !== null && (
        <NewSwapDialog
          initialText={scannedText}
          onClose={() => setScannedText(null)}
        />
      )}
    </div>
  );
}
