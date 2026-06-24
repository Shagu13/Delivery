import { useBranding } from '../../contexts/BrandingContext';
import { useAuth } from '../../contexts/useAuth';
import { HomePage } from './HomePage';
import { TenantHomePage } from '../Tenant/TenantHomePage';
import { TenantOwnHomePage } from '../Tenant/TenantOwnHomePage';
import { LivoHomePage } from '../Tenant/LivoHomePage';
import { isLivoHost } from '../Tenant/livoHost';

/** Neutral loader shown while the host's branding is still resolving — avoids
 *  flashing the dilo homepage on a tenant domain before the tenant page renders. */
function HomeFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid var(--color-border, #e5e7eb)',
        borderTopColor: 'var(--color-accent, #c47f17)',
        animation: 'home-resolve-spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes home-resolve-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Public "/" route: renders the tenant's white-label homepage when the host resolves to a
 * tenant, otherwise the default (dilo) homepage.
 *
 * The LivoExpress host is authoritative and resolved synchronously from the hostname, so its
 * storefront (LivoHomePage) renders immediately. For any other tenant domain we wait for the
 * branding lookup before deciding — showing a neutral loader meanwhile rather than flashing
 * the dilo homepage and then swapping to the tenant page. Once resolved, a tenant host shows
 * TenantHomePage and the root (dilo) host shows HomePage.
 *
 * A logged-in tenant co-admin on a non-tenant host (e.g. a shared *.azurewebsites.net) sees
 * THEIR OWN storefront via TenantOwnHomePage, so they can verify it without a dedicated domain.
 */
export function HomeRoute() {
  const { isTenant, loaded, brandName, logoUrl } = useBranding();
  const { user } = useAuth();
  if (isLivoHost(window.location.hostname))
    return <LivoHomePage brandName={brandName} logoUrl={logoUrl} />;
  if (user?.role === 'TenantAdmin') return <TenantOwnHomePage />;
  if (!loaded) return <HomeFallback />;
  return isTenant ? <TenantHomePage /> : <HomePage />;
}
