import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Layout } from "@/components/layout";
import { useIsAdmin } from "@/hooks/use-is-admin";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Templates from "@/pages/templates";
import TemplatePreview from "@/pages/templates/preview";
import ImportTemplate from "@/pages/templates/import";
import Websites from "@/pages/websites";
import CreateWebsite from "@/pages/websites/new";
import EditWebsite from "@/pages/websites/edit";
import WebsiteAnalytics from "@/pages/websites/analytics";
import Settings from "@/pages/settings";
import Docs from "@/pages/docs";
import Support from "@/pages/support";
import ImageLibrary from "@/pages/ImageLibrary";
import GalleryManager from "@/pages/GalleryManager";

const queryClient = new QueryClient();

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const isAdmin = useIsAdmin();
  return isAdmin ? <Component /> : <Redirect to="/templates" />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/"><Redirect to="/templates" /></Route>
        <Route path="/templates" component={Templates} />
        <Route path="/templates/:id/preview" component={TemplatePreview} />
        <Route path="/templates/import">
          {() => <AdminRoute component={ImportTemplate} />}
        </Route>
        <Route path="/websites" component={Websites} />
        <Route path="/websites/new" component={CreateWebsite} />
        <Route path="/websites/:id/edit" component={EditWebsite} />
        <Route path="/websites/:id/analytics" component={WebsiteAnalytics} />
        <Route path="/settings" component={Settings} />
        <Route path="/docs" component={Docs} />
        <Route path="/support" component={Support} />
        <Route path="/image-library">
          {() => <AdminRoute component={ImageLibrary} />}
        </Route>
        <Route path="/gallery" component={GalleryManager} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    // Resolve auth context from the server — never from URL params or client storage.
    // If the user is not authenticated, redirect them to the login page.
    fetch("/api/website-builder/context", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          // Not authenticated — send back to the booking app login page,
          // with a redirect param so after login they come back here.
          window.location.href = "/auth?redirect=/website-builder/";
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data: { storeId: string | null; isAdmin?: boolean } | null) => {
        if (!data) return;
        if (data.isAdmin) {
          // Server confirmed this session belongs to a platform admin
          sessionStorage.setItem("isAdmin", "true");
          // If this admin also owns a store (e.g. they're a salon owner with admin rights),
          // preserve their storeId so gallery/GBP features work for them too.
          if (data.storeId) {
            sessionStorage.setItem("storeid", data.storeId);
          } else {
            sessionStorage.removeItem("storeid");
          }
          window.dispatchEvent(new Event("certxa:adminChanged"));
        } else {
          // Ensure admin flag is cleared for non-admin sessions
          sessionStorage.removeItem("isAdmin");
          if (data.storeId) {
            // Store in sessionStorage (not localStorage) so it clears on tab close
            sessionStorage.setItem("storeid", data.storeId);
          }
        }
      })
      .catch(() => {
        // Network error — redirect to login as a safe fallback
        window.location.href = "/auth?redirect=/website-builder/";
      });

    // Strip legacy ?token= from the URL (cleanup for bookmarked old links)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("token")) {
      urlParams.delete("token");
      const newSearch = urlParams.toString();
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + (newSearch ? `?${newSearch}` : "")
      );
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
