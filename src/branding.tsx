import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './local-client';

export interface Branding { orgName: string; tagline: string; logo: string }

const DEFAULT_BRANDING: Branding = { orgName: 'KGGA', tagline: 'Girls creating a better world', logo: '' };

const Ctx = createContext<{ branding: Branding; setBranding: (b: Branding) => void; reload: () => void }>({
  branding: DEFAULT_BRANDING,
  setBranding: () => {},
  reload: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  const reload = useCallback(() => {
    api.get('/api/branding').then((r) => {
      if (r.data && typeof r.data === 'object') setBranding({ ...DEFAULT_BRANDING, ...r.data });
    }).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => { document.title = `${branding.orgName} Membership System`; }, [branding.orgName]);

  return <Ctx.Provider value={{ branding, setBranding, reload }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);

export function Logo({ className = 'brand-badge' }: { className?: string }) {
  const { branding } = useBranding();
  if (branding.logo) {
    return <div className={`${className} has-logo`}><img src={branding.logo} alt={`${branding.orgName} logo`} /></div>;
  }
  return <div className={className}>{branding.orgName.slice(0, 2).toUpperCase()}</div>;
}
