import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiroErrorBoundary from '../export-plugins/AiroErrorBoundary';
import App from './App';
import './styles/globals.css';

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// The Certxa server renders only some paths from this app; the rest of
// certxa.com is still served elsewhere. `__SITE_PATHS__` lists the paths this
// app owns. A click on any other same-site link must load the page from the
// server instead of being handled by the in-page router, which would show
// this app's own version of that page.
const ownedPaths: string[] | undefined = (window as unknown as { __SITE_PATHS__?: string[] })
  .__SITE_PATHS__;
if (ownedPaths) {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return;
      const path = anchor.pathname.replace(/\/+$/, '') || '/';
      if (ownedPaths.includes(path)) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(anchor.href);
    },
    true,
  );
}

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

const providers = (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </HelmetProvider>
);

// Root-level dev error boundary. The inner boundary in App.tsx lives
// inside the route element (so it can catch route render errors before
// React Router swaps in its own error UI), which leaves everything
// OUTSIDE the router uncaught: provider crashes, errors in App itself,
// and render errors in components mounted as siblings of <RouterProvider>
// (e.g. an analytics loader calling useLocation() outside the router).
// Those throw on first render before the inner boundary ever mounts, so
// only an ancestor boundary above the providers can catch them. This
// boundary also owns the global window.onerror/unhandledrejection
// handlers (the inner one opts out via captureGlobalErrors={false}).
const tree = (
  <StrictMode>
    {import.meta.env.MODE === 'development' ? (
      <AiroErrorBoundary>{providers}</AiroErrorBoundary>
    ) : (
      providers
    )}
  </StrictMode>
);

// SSR markup is detected via a child element inside the #app root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, tree);
} else {
  createRoot(rootElement).render(tree);
}
