import { useSyncMeta } from '../store/syncStore';

/** A one-shot dismissible banner shown when an owner revoked a shared album we had joined. */
export default function RevocationNotice() {
  const notice = useSyncMeta((s) => s.revokedNotice);
  const clear = useSyncMeta((s) => s.clearRevokedNotice);
  if (!notice) return null;
  return (
    <div className="revocation-notice" role="status">
      <span>{notice}</span>
      <button type="button" className="btn" onClick={clear}>Got it</button>
    </div>
  );
}
