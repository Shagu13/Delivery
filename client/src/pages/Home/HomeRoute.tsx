import { useBranding } from '../../contexts/BrandingContext';
import { useAuth } from '../../contexts/useAuth';
import { HomePage } from './HomePage';
import { TenantHomePage } from '../Tenant/TenantHomePage';
import { TenantOwnHomePage } from '../Tenant/TenantOwnHomePage';
import { LivoHomePage } from '../Tenant/LivoHomePage';
import { isLivoHost } from '../Tenant/livoHost';

/**
 * Public "/" route: renders the tenant's white-label homepage when the host resolves to a
 * tenant, otherwise the default (dilo) homepage.
 *
 * The LivoExpress host is authoritative and resolved synchronously from the hostname, so its
 * storefront (LivoHomePage) renders immediately — never flashing or falling back to the dilo
 * homepage while branding loads, or if the branding lookup fails. Brand name/logo/color fill
 * in from branding once available. Other tenants use the generic block-based TenantHomePage,
 * shown once branding resolves (dilo homepage meanwhile so the main site never blanks).
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
  return loaded && isTenant ? <TenantHomePage /> : <HomePage />;
}
