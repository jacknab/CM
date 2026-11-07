/**
 * /solo/billing (owner, 2026-11-07): on a computer, signed in on the website, Billing is drawn inside the Solo
 * dashboard with its menu. On a phone, and for the app's billing-only sign-in (which can reach nothing but billing,
 * so not the dashboard's data), it stays the page of its own that the app opens.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import SoloBilling from "./SoloBilling";
import SoloLayout from "./SoloLayout";

const DESKTOP = "(min-width: 768px)";

function useDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function SoloBillingPage() {
  const { user, isLoading } = useAuth() as any;
  const desktop = useDesktop();
  if (isLoading) return null;
  if (desktop && user && !user.appLink) return <SoloLayout><SoloBilling inLayout /></SoloLayout>;
  return <SoloBilling />;
}
