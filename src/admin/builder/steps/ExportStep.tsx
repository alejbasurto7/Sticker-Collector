import { useEffect, useRef, useState } from 'react';

interface ExportStepProps {
  source: string;
}

export default function ExportStep({ source }: ExportStepProps) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      showToast('Copied to clipboard');
    } catch {
      showToast('Clipboard blocked — use Download');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'albumTypes.generated.ts';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded albumTypes.generated.ts');
  };

  const handleWrite = async () => {
    try {
      const res = await fetch('/__write-album-types', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: source,
      });
      if (res.ok) showToast('Wrote src/data/albumTypesData.ts ✓ — hot-reloading');
      else showToast(`Write failed (${res.status}) — dev server only`);
    } catch {
      showToast('Write failed — only works under npm run dev');
    }
  };

  return (
    <div className="builder-panel">
      <h3 style={{ margin: '0 0 12px' }}>Export registry</h3>

      <pre
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 10,
          fontSize: 12,
          whiteSpace: 'pre',
          maxHeight: 360,
          overflow: 'auto',
          margin: '0 0 8px',
        }}
      >
        {source}
      </pre>

      <p style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.7 }}>
        {source.split('\n').length} lines · {source.length} chars
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="builder-btn builder-btn--primary" onClick={handleWrite}>Write to project</button>
        <button className="builder-btn" onClick={handleCopy}>Copy</button>
        <button className="builder-btn" onClick={handleDownload}>Download</button>
      </div>

      <p style={{ margin: 0, fontSize: 13 }}>
        <strong>Write to project</strong> saves this straight to <code>src/data/albumTypesData.ts</code>{' '}
        (works under <code>npm run dev</code>; the app hot-reloads) — then review &amp; commit.
        Copy / Download produce the same module if you'd rather paste it yourself.
      </p>

      {toast && <div className="builder-toast">{toast}</div>}
    </div>
  );
}
