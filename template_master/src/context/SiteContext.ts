import { createContext, useContext } from 'react';
import type { SiteData } from '../hooks/useSiteData';

export const SiteContext = createContext<SiteData | null>(null);
export const useSite = () => useContext(SiteContext);
