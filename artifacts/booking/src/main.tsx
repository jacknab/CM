import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installNativeViewportLock } from "./lib/nativeViewportLock";

installNativeViewportLock();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

const rootEl = document.getElementById("root")!;

createRoot(rootEl).render(<App />);
