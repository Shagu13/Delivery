import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { getMyBranding } from '../../api/tenantBranding';
import { parseHomepage } from '../../types/homepage';
import type { HomepageBlock } from '../../types/homepage';
import { TenantHomePage } from './TenantHomePage';
import { LivoHomePage } from './LivoHomePage';
import { isLivoHost } from './livoHost';

/**
 * A tenant co-admin's own storefront, rendered regardless of the current host.
 *
 * The public homepage is normally resolved by hostname (see BrandingProvider /
 * HomeRoute). This lets a logged-in TenantAdmin view their published homepage on
 * any domain — e.g. a shared *.azurewebsites.net where the host can't resolve to
 * the tenant — by loading their own saved branding directly. The primary color is
 * applied locally to the accent var (only when it's a valid 6-digit hex).
 *
 * LivoExpress gets its hand-built storefront (LivoHomePage); other tenants use the
 * generic block-based TenantHomePage.
 */
export function TenantOwnHomePage() {
  const { token } = useAuth();
  const [brandName, setBrandName] = useState('');
  const [logoUrl,   setLogoUrl]   = useState<string | null>(null);
  const [color,     setColor]     = useState<string | null>(null);
  const [sections,  setSections]  = useState<HomepageBlock[]>([]);
  const [isLivo,    setIsLivo]    = useState(false);
  const [loaded,    setLoaded]    = useState(false);

  useEffect(() => {
    if (!token) { setLoaded(true); return; }
    let cancelled = false;
    getMyBranding(token)
      .then(b => {
        if (cancelled) return;
        setBrandName(b.displayName);
        setLogoUrl(b.logoUrl);
        const c = (b.primaryColor ?? '').trim();
        setColor(/^#?[0-9a-f]{6}$/i.test(c) ? (c.startsWith('#') ? c : `#${c}`) : null);
        setSections(parseHomepage(b.homepageJson).sections);
        setIsLivo(isLivoHost(b.host));
      })
      .catch(() => { /* fall back to the default skeleton */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [token]);

  if (!loaded) return null;

  return (
    <div style={color ? ({ ['--color-accent' as string]: color }) : undefined}>
      {isLivo
        ? <LivoHomePage brandName={brandName} logoUrl={logoUrl} />
        : <TenantHomePage brandName={brandName} sections={sections} />}
    </div>
  );
}
