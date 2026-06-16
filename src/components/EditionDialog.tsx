import { useCollection } from '../store/collectionStore';
import { EDITION_INFO } from '../data/sampleAlbum';
import type { Edition } from '../types';

interface Props {
  onClose: () => void;
}

const ORDER: Edition[] = ['latam', 'na'];

export default function EditionDialog({ onClose }: Props) {
  const edition = useCollection((s) => s.edition);
  const setEdition = useCollection((s) => s.setEdition);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Album edition</h2>
        <p className="modal-sub">
          The editions differ only in the Coca-Cola page size. Switching keeps all your
          existing stickers — it just shows or hides the extra slots.
        </p>

        {ORDER.map((key) => {
          const info = EDITION_INFO[key];
          const selected = edition === key;
          return (
            <button
              key={key}
              className="swap-card"
              style={{
                width: '100%',
                textAlign: 'left',
                borderColor: selected ? 'var(--green)' : 'var(--border)',
              }}
              onClick={() => {
                setEdition(key);
                onClose();
              }}
            >
              <div className="swap-top">
                <span className="swap-name">{info.label}</span>
                {selected && <span className="pill open">current</span>}
              </div>
              <div className="swap-summary">
                <span>{info.region}</span>
                <span>Coca-Cola: {info.ccCount} stickers</span>
              </div>
            </button>
          );
        })}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
