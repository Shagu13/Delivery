import { createContext, useContext } from 'react';

export interface BrandingValue {
  /** Brand name shown in the nav/login — falls back to the root brand. */
  brandName: string;
  /** Tenant logo URL, or null to use the default dilo logo. */
  logoUrl: string | null;
  /** Tenant primary color (hex), or null for the default accent. */
  primaryColor: string | null;
  /** True once the host lookup has resolved (tenant or root). */
  loaded: boolean;
  /** True when a white-label tenant matched the current host. */
  isTenant: boolean;
}

export const DEFAULT_BRANDING: BrandingValue = {
  brandName: 'Delivery',
  logoUrl: null,
  primaryColor: null,
  loaded: false,
  isTenant: false,
};

export const BrandingContext = createContext<BrandingValue>(DEFAULT_BRANDING);

export const useBranding = () => useContext(BrandingContext);
