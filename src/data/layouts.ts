// Back-compat shim. The album layout now lives in the active album type
// (src/data/albumTypes.ts); this keeps the renderer, editor, and tests importing
// `TEMPLATES`/`templateFor` from here unchanged. (Stage 1B rewires them.)
import { activeType } from './albumTypes';

export { templateFor, pagesSupportPages } from './albumTypes';
export type { SectionTemplate, TemplateSlot, TemplatePage } from './layoutGeometry';

/** The active album type's templates, keyed by template id. */
export const TEMPLATES = activeType.templates;
