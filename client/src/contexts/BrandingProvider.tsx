import { useEffect, useState } from 'react';
import { fetchBranding } from '../api/branding';
import { BrandingContext, DEFAULT_BRANDING, type BrandingValue } from './BrandingContext';

/** Parse "#RRGGBB" → "rgba(r, g, b, a)"; null if not a 6-digit hex. */
function hexToRgba(hex: string, alpha: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Resolves white-label branding from the current host on load and applies it: overrides the
 * accent CSS variables with the tenant's primary color and exposes the brand name + logo.
 * Falls back to the root (dilo) branding when no tenant matches the host.
 */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BrandingValue>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;
    fetchBranding(window.location.hostname)
      .then(b => {
        if (cancelled) return;
        if (!b) { setState(s => ({ ...s, loaded: true })); return; }

        setState({
          brandName:    b.displayName,
          logoUrl:      b.logoUrl,
          primaryColor: b.primaryColor,
          homepageJson: b.homepageJson,
          loaded:       true,
          isTenant:     true,
        });
        document.title = b.displayName;

        // Only apply a valid 6-digit hex; an invalid value (e.g. "#EF2A") would
        // otherwise poison the accent var and leave the theme broken.
        const dim = b.primaryColor ? hexToRgba(b.primaryColor, 0.08) : null;
        if (b.primaryColor && dim) {
          const hex  = b.primaryColor.trim().startsWith('#') ? b.primaryColor.trim() : `#${b.primaryColor.trim()}`;
          const root = document.documentElement;
          root.style.setProperty('--color-accent', hex);
          root.style.setProperty('--color-accent-dim', dim);
          const glow = hexToRgba(b.primaryColor, 0.2);
          if (glow) root.style.setProperty('--color-accent-glow', glow);
        }
      })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, loaded: true })); });
    return () => { cancelled = true; };
  }, []);

  return <BrandingContext.Provider value={state}>{children}</BrandingContext.Provider>;
}
