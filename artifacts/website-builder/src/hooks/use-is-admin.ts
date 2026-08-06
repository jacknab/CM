import { useState, useEffect } from "react";

/**
 * Returns true when the server has confirmed the current session has admin privileges.
 *
 * Admin status is set exclusively by App.tsx after verifying with the server-side
 * /api/website-builder/context endpoint — never from URL parameters or client-side
 * manipulation. This prevents privilege escalation via URL tampering.
 *
 * The flag is stored in sessionStorage so it resets when the tab or browser is closed.
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    // Clean up any legacy localStorage flag that may have been set by older code
    const legacy = localStorage.getItem("isAdmin");
    if (legacy !== null) {
      localStorage.removeItem("isAdmin");
    }
    return sessionStorage.getItem("isAdmin") === "true";
  });

  useEffect(() => {
    const handler = () => {
      setIsAdmin(sessionStorage.getItem("isAdmin") === "true");
    };
    window.addEventListener("certxa:adminChanged", handler);
    return () => window.removeEventListener("certxa:adminChanged", handler);
  }, []);

  return isAdmin;
}
