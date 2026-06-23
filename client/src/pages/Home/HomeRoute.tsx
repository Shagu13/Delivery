import { useBranding } from '../../contexts/BrandingContext';
import { HomePage } from './HomePage';
import { TenantHomePage } from '../Tenant/TenantHomePage';

/**
 * Public "/" route: renders the tenant's white-label homepage when the host resolves to a
 * tenant, otherwise the default (dilo) homepage. Renders the dilo homepage while branding is
 * still loading so the main site never blanks; switches to the tenant page once resolved.
 */
export function HomeRoute() {
  const { isTenant, loaded } = useBranding();
  return loaded && isTenant ? <TenantHomePage /> : <HomePage />;
}
