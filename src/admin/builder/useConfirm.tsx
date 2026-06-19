import { useCallback, useState, type ReactNode } from 'react';

export type Confirm = (opts: { message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;

interface ConfirmOpts { message: string; confirmLabel?: string; danger?: boolean; }
interface Pending extends ConfirmOpts { resolve: (ok: boolean) => void; }

export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(null); };
  const element: ReactNode = pending ? (
    <div className="builder-confirm-backdrop" onClick={() => close(false)}>
      <div className="builder-confirm" onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: 0 }}>{pending.message}</p>
        <div className="builder-confirm-actions">
          <button className="builder-btn builder-btn--ghost builder-btn--sm" onClick={() => close(false)}>Cancel</button>
          <button className={`builder-btn builder-btn--sm ${pending.danger ? 'builder-btn--danger' : 'builder-btn--primary'}`}
            onClick={() => close(true)}>{pending.confirmLabel ?? 'Confirm'}</button>
        </div>
      </div>
    </div>
  ) : null;
  return { confirm, element };
}
