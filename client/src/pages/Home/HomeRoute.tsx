import { useBranding } from '../../contexts/BrandingContext';
import { useAuth } from '../../contexts/useAuth';
import { HomePage } from './HomePage';
import { TenantHomePage } from '../Tenant/TenantHomePage';
import { TenantOwnHomePage } from '../Tenant/TenantOwnHomePage';

/**
 * Public "/" route: renders the tenant's white-label homepage when the host resolves to a
 * tenant, otherwise the default (dilo) homepage. Renders the dilo homepage while branding is
 * still loading so the main site never blanks; switches to the tenant page once resolved.
 *
 * A logged-in tenant co-admin always sees THEIR OWN storefront here, even when the current
 * host doesn't resolve to their tenant (e.g. a shared *.azurewebsites.net) — so they can
 * verify their published homepage without a dedicated domain.
 */
export function HomeRoute() {
  const { isTenant, loaded } = useBranding();
  const { user } = useAuth();
  if (user?.role === 'TenantAdmin') return <TenantOwnHomePage />;
  return loaded && isTenant ? <TenantHomePage /> : <HomePage />;
}
