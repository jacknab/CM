import { createRoot, hydrateRoot } from 'react-dom/client';
import { QueryClient, hydrate } from '@tanstack/react-query';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

declare global {
  interface Window {
    __CERTXA_QUERY_STATE__?: unknown;
  }
}

const queryClient = new QueryClient();
if (window.__CERTXA_QUERY_STATE__) {
  hydrate(queryClient, window.__CERTXA_QUERY_STATE__);
}

const rootEl = document.getElementById('root')!;
const app = (
  <ErrorBoundary>
    <App queryClient={queryClient} />
  </ErrorBoundary>
);

const rootOptions = {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error: unknown, errorInfo: { componentStack?: string }) => {
    console.error(error, errorInfo.componentStack);
  },
};

// Server-rendered markup is present (real production requests) → hydrate in
// place. Empty #root only happens under plain `vite dev` with no SSR
// middleware in front of it → fall back to a normal client-only mount.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, app, rootOptions);
} else {
  createRoot(rootEl, rootOptions).render(app);
}
