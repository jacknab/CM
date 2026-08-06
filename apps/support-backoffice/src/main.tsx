import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("[GLOBAL ERROR - NOT caught by boundary]", e.message, e.error?.stack);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[UNHANDLED REJECTION]", e.reason);
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 0,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
