// ── Tenant homepage content model (frontend owns this schema; backend stores it opaque) ──

export type HomepageBlock =
  | { id: string; type: 'hero';  title: string; subtitle: string; imageUrl: string }
  | { id: string; type: 'text';  heading: string; body: string }
  | { id: string; type: 'image'; imageUrl: string; caption: string };

export type HomepageBlockType = HomepageBlock['type'];

export interface HomepageDoc {
  sections: HomepageBlock[];
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `b${Date.now()}${Math.random()}`;

/** Parse the stored JSON into a doc; tolerant of null / malformed input. */
export function parseHomepage(json: string | null | undefined): HomepageDoc {
  if (!json) return { sections: [] };
  try {
    const d = JSON.parse(json) as HomepageDoc;
    return Array.isArray(d?.sections) ? { sections: d.sections } : { sections: [] };
  } catch {
    return { sections: [] };
  }
}

/** A fresh block of the given type with empty fields. */
export function emptyBlock(type: HomepageBlockType): HomepageBlock {
  switch (type) {
    case 'hero':  return { id: newId(), type: 'hero',  title: '', subtitle: '', imageUrl: '' };
    case 'text':  return { id: newId(), type: 'text',  heading: '', body: '' };
    case 'image': return { id: newId(), type: 'image', imageUrl: '', caption: '' };
  }
}
