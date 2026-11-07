/**
 * Google reCAPTCHA v3 for the website message forms (owner, 2026-11-07; server: lib/recaptcha.ts). Invisible: the
 * script loads with the form, and a token is asked for when the client sends. Google's corner badge is hidden; the
 * forms show Google's notice line instead (RecaptchaNotice), which Google requires when the badge is hidden.
 */
import { useEffect, useState } from "react";

declare global {
  interface Window { grecaptcha?: { ready: (cb: () => void) => void; execute: (key: string, opts: { action: string }) => Promise<string> } }
}

let loading: Promise<void> | null = null;

function load(siteKey: string): Promise<void> {
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      if (!document.getElementById("recaptcha-badge-hidden")) {
        const style = document.createElement("style");
        style.id = "recaptcha-badge-hidden";
        style.textContent = ".grecaptcha-badge{visibility:hidden!important}";
        document.head.appendChild(style);
      }
      const s = document.createElement("script");
      s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      s.async = true;
      s.onload = () => (window.grecaptcha ? window.grecaptcha.ready(() => resolve()) : reject(new Error("reCAPTCHA missing")));
      s.onerror = () => { loading = null; reject(new Error("reCAPTCHA not loaded")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** The site key when reCAPTCHA is on (GET /api/public/messages-config), loading Google's script as soon as it is known. */
export function useRecaptcha(): string | null {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/messages-config").then((r) => (r.ok ? r.json() : null)).then((c) => {
      const key = typeof c?.recaptchaSiteKey === "string" ? c.recaptchaSiteKey : null;
      if (!live || !key) return;
      setSiteKey(key);
      void load(key).catch(() => undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return siteKey;
}

/** A token for this send, or undefined (no key, or Google couldn't be reached — the server then decides). */
export async function recaptchaToken(siteKey: string | null, action: string): Promise<string | undefined> {
  if (!siteKey) return undefined;
  try {
    await load(siteKey);
    return await window.grecaptcha!.execute(siteKey, { action });
  } catch {
    return undefined;
  }
}

/** Google's notice, required when its badge is hidden. */
export function RecaptchaNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-gray-500 ${className}`} data-testid="recaptcha-notice">
      This site is protected by reCAPTCHA and the Google{" "}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a> and{" "}
      <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a> apply.
    </p>
  );
}
