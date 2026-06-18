import type { CSSProperties } from 'react';

// Readable buttons on the editor's dark background (the app's global button CSS
// renders plain buttons as near-invisible light-on-light).
export const BTN: CSSProperties = {
  background: '#223047', color: '#e7ecf3', border: '1px solid #3a4a60',
  borderRadius: 6, padding: '5px 10px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
export const BTN_SM: CSSProperties = { ...BTN, padding: '3px 7px', fontSize: 11 };

/** Deep clone via JSON — editor data is plain. */
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
