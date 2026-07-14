import React from 'react';

// Wraps every case-insensitive occurrence of `term` inside `text` with a highlighted
// <mark>, so an admin can instantly see where a search matched. Used by the global order
// search and by the pages it jumps to. Styling is inline (no external CSS dependency) and
// works in both light and dark themes (solid amber background, dark text).
export function Highlight({ text, term }: { text: string | null | undefined; term: string }) {
  const value = text ?? '';
  const q = term.trim();
  if (!q || !value) return <>{value}</>;

  // Escape regex metacharacters in the user-typed term.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = value.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: '#facc15',
              color: '#1a1a1a',
              borderRadius: 2,
              padding: '0 1px',
              fontWeight: 700,
            }}
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
