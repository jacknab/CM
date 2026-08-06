import { useState, useEffect } from "react";

/**
 * Returns the current session's store ID (for salon owner sessions).
 * Returns null for platform admins (who have no single store) or unauthenticated users.
 *
 * Set by App.tsx after the /api/website-builder/context response.
 */
export function useStoreId(): number | null {
  const [storeId, setStoreId] = useState<number | null>(() => {
    const raw = sessionStorage.getItem("storeid");
    const n = raw ? parseInt(raw, 10) : NaN;
    return isNaN(n) ? null : n;
  });

  useEffect(() => {
    const handler = () => {
      const raw = sessionStorage.getItem("storeid");
      const n = raw ? parseInt(raw, 10) : NaN;
      setStoreId(isNaN(n) ? null : n);
    };
    window.addEventListener("certxa:storeChanged", handler);
    return () => window.removeEventListener("certxa:storeChanged", handler);
  }, []);

  return storeId;
}
