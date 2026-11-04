/**
 * "Walking in? Current wait 10–15 min · Check in online" — on a barbershop's booking page, when its Online Check-In
 * Line is open (plans/online-checkin-line.md). Nothing at all when the shop has no line or it is closed.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLine, type PublicLine } from "./lineApi";

export function WalkInBanner({ slug }: { slug: string }) {
  const [line, setLine] = useState<PublicLine | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetchLine(slug).then((l) => { if (live) setLine(l); }).catch(() => {});
    load();
    const iv = setInterval(load, 60_000);
    return () => { live = false; clearInterval(iv); };
  }, [slug]);
  if (!line || !line.open || line.waitMin == null) return null;
  return (
    <Link to={`/q/${encodeURIComponent(slug)}`} data-testid="walkin-banner"
      className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 no-underline text-inherit hover:bg-gray-50">
      <span><span className="block text-sm text-gray-500">Walking in? Current wait</span><span className="block text-lg font-bold">{line.waitText}</span></span>
      <span className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: "var(--site-accent, #1f3a5f)", color: "#fff" }}>Check in online</span>
    </Link>
  );
}
