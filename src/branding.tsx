import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './local-client';

export interface Branding { orgName: string; tagline: string; logo: string }

const DEFAULT_BRANDING: Branding = { orgName: 'KGGA', tagline: 'Girls creating a better world', logo: '' };
const BRANDING_CACHE_KEY = 'kgga-branding-cache';

function readCachedBranding(): Branding {
  try {
    const cached = localStorage.getItem(BRANDING_CACHE_KEY);
    return cached ? { ...DEFAULT_BRANDING, ...JSON.parse(cached) } : DEFAULT_BRANDING;
  } catch {
    return DEFAULT_BRANDING;
  }
}

const Ctx = createContext<{ branding: Branding; setBranding: (b: Branding) => void; reload: () => void }>({
  branding: DEFAULT_BRANDING,
  setBranding: () => {},
  reload: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBrandingState] = useState<Branding>(readCachedBranding);

  const setBranding = useCallback((next: Branding) => {
    setBrandingState(next);
    try { localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(next)); } catch { /* Cache is optional. */ }
  }, []);

  const reload = useCallback(() => {
    api.get('/api/branding').then((r) => {
      if (r.data && typeof r.data === 'object') setBranding({ ...DEFAULT_BRANDING, ...r.data });
    }).catch(() => {});
  }, [setBranding]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => { document.title = `${branding.orgName} Membership System`; }, [branding.orgName]);

  return <Ctx.Provider value={{ branding, setBranding, reload }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);

export function Logo({ className = 'brand-badge' }: { className?: string }) {
  const { branding } = useBranding();
  if (!branding.logo) return <div className={`${className} is-empty`} aria-hidden="true" />;
  return <div className={`${className} has-logo`}><img src={branding.logo} alt={`${branding.orgName} logo`} /></div>;
}
