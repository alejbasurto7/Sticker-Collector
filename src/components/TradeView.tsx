import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useCollection } from '../store/collectionStore';
import { buildExportText } from '../utils/qr';
import TradeHistory from './TradeHistory';
import NewSwapDialog from './NewSwapDialog';

interface BarcodeDetectorResult {
  rawValue: string;
}
interface BarcodeDetectorInit {
  formats: string[];
}
declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorInit);
  detect(source: HTMLVideoElement | HTMLImageElement): Promise<BarcodeDetectorResult[]>;
}

export default function TradeView() {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    const canvas = canvasRef.current;
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

  // Stop camera stream when scanning closes.
  useEffect(() => {
    if (!scanning) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [scanning]);

  const startCamera = async () => {
    setScanError('');
    if (!('BarcodeDetector' in window)) {
      setScanError('QR scanning requires Chrome or Edge. Use "Upload QR image" instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
      // Give the video element time to mount.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          detectFromVideo();
        }
      });
    } catch {
      setScanError('Camera access denied. Try "Upload QR image" instead.');
    }
  };

  const detectFromVideo = async () => {
    if (!videoRef.current || !streamRef.current) return;
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (!videoRef.current || !streamRef.current) return;
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          handleScannedValue(results[0].rawValue);
          return;
        }
      } catch {}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const handleScannedValue = (value: string) => {
    setScanning(false);
    setScannedText(value);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!('BarcodeDetector' in window)) {
      setScanError('QR image reading requires Chrome or Edge.');
      return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(img);
        URL.revokeObjectURL(img.src);
        if (results.length > 0) {
          handleScannedValue(results[0].rawValue);
        } else {
          setScanError('No QR code found in the image.');
        }
      } catch {
        setScanError('Could not read the QR code from that image.');
      }
    };
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

      {/* QR code */}
      <div className="trade-qr-wrap">
        {scanning ? (
          <div className="trade-scanner">
            <video ref={videoRef} className="trade-video" playsInline muted />
            <button className="btn trade-cancel-scan" onClick={() => setScanning(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <canvas ref={canvasRef} className="trade-qr-canvas" />
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
