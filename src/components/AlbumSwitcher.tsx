import { useCollection } from '../store/collectionStore';
import { useResolvedAlbumName } from '../sync/useAlbumMode';
import { monogram, coverTint } from '../utils/albumCover';
import { ALBUM_TYPE } from '../config';

interface Props {
  onOpen: () => void;
}

/** Header control: the active album (monogram · name + count · album type · chevron).
 *  Tapping opens the Library sheet to switch, manage, or add albums. */
export default function AlbumSwitcher({ onOpen }: Props) {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const albumName = useCollection((s) => s.albumName);
  const albums = useCollection((s) => s.albums);
  const name = useResolvedAlbumName(activeAlbumId, albumName);

  const total = albums.length;
  const index = albums.findIndex((a) => a.id === activeAlbumId);
  const multi = total > 1;

  return (
    <button
      type="button"
      className="album-switcher"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={
        multi
          ? `${name}, album ${index + 1} of ${total}. Switch or add albums`
          : `${name}. Switch or add albums`
      }
    >
      <span className={`album-cover tint-${coverTint(activeAlbumId)}`} aria-hidden="true">
        {monogram(name)}
      </span>
      <span className="album-switcher-text">
        <span className="album-switcher-line1">
          <span className="album-switcher-name">{name}</span>
          {multi && <span className="album-switcher-count">{index + 1}/{total}</span>}
        </span>
        <span className="album-switcher-type">{ALBUM_TYPE}</span>
      </span>
      <span className="album-switcher-caret" aria-hidden="true">▾</span>
    </button>
  );
}
