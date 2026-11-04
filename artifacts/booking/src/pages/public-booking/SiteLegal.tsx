/**
 * Terms of Service and Privacy Policy on a business's own website (owner, 2026-11-04: Twilio SMS compliance). They open
 * as a full-screen page over the site from any link to #terms or #privacy, so https://<slug>.certxa.com/#terms is an
 * address a carrier reviewer can open. The wording is written for this business: its name, place and contact details.
 */
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { StoreData } from "./types";

type Doc = "terms" | "privacy";
const UPDATED = "November 4, 2026";

const docFromHash = (): Doc | null => {
  const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
  return h === "terms" || h === "privacy" ? h : null;
};

const phoneText = (p?: string | null) => {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? "";
};

const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-7">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
  </section>
);

function Contact({ store }: { store: StoreData }) {
  const phone = phoneText(store.phone);
  return (
    <Part title="Contact">
      <p>{store.name}{store.city ? `, ${[store.city, store.state].filter(Boolean).join(", ")}` : ""}</p>
      {phone && <p><a className="underline" href={`tel:${store.phone}`}>{phone}</a></p>}
      {store.email && <p><a className="underline" href={`mailto:${store.email}`}>{store.email}</a></p>}
    </Part>
  );
}

function Terms({ store }: { store: StoreData }) {
  const name = store.name;
  const phone = phoneText(store.phone);
  const canBookWithoutTexts = !!phone || store.bookingApproval !== "manual";
  return (
    <>
      <p className="mt-4 text-[15px] leading-relaxed text-gray-700">
        These terms cover this website and booking with {name}. By using this site or booking an appointment, you agree to them.
      </p>
      <Part title="Booking">
        <p>Please give your real name and a mobile number you can be reached on. {store.bookingApproval === "manual" ? `Each booking is a request until ${name} accepts it.` : `${name} may contact you if a booking needs to change.`}</p>
      </Part>
      <Part title="Payments, deposits and cancellations">
        <p>Prices are set by {name}. Any deposit, cancellation fee or no-show fee is shown before you book or pay. Card payments are handled by Stripe.</p>
      </Part>
      <Part title="Gift cards and packages">
        <p>Gift cards and prepaid packages bought on this site are used with {name}. They can't be exchanged for cash unless the law requires it. Ask {name} about refunds.</p>
      </Part>
      <Part title="Text messages">
        <p><strong>Program:</strong> {name} Appointment Texts.</p>
        <p><strong>What you get:</strong> if you tick the text box when you book, {name} sends you texts about your appointment: confirmations, reminders, replies to booking requests, and follow-ups such as a request for a review. This agreement covers texts about your appointments. It does not cover promotional messages.</p>
        {canBookWithoutTexts && <p>Agreeing to texts is not a condition of buying any service.{phone ? ` You can book by calling ${phone}.` : ""}</p>}
        <p><strong>How often:</strong> message frequency varies with your bookings.</p>
        <p><strong>Cost:</strong> message and data rates may apply.</p>
        <p><strong>To stop:</strong> reply STOP to any text. You'll get one message confirming you've been removed.</p>
        <p><strong>For help:</strong> reply HELP to any text, or contact {name} using the details below.</p>
        <p>Mobile carriers are not liable for delayed or undelivered messages.</p>
        <p>How your number is handled is in the <a className="underline" href="#privacy">Privacy Policy</a>.</p>
      </Part>
      <Part title="Using this site">
        <p>Please don't misuse this site, make false bookings or post reviews of visits that didn't happen.</p>
      </Part>
      <Part title="Who provides what">
        <p>{name} is an independent business and provides all services. Certxa provides the booking software and is not the provider of those services. To the extent the law allows, this site is provided as it is, without warranties.</p>
      </Part>
      <Part title="Changes and governing law">
        <p>These terms may change; the date at the top shows the latest version. They are governed by the laws of {store.state ? `the state of ${store.state}` : `the state where ${name} operates`}.</p>
      </Part>
      <Contact store={store} />
    </>
  );
}

function Privacy({ store }: { store: StoreData }) {
  const name = store.name;
  return (
    <>
      <p className="mt-4 text-[15px] leading-relaxed text-gray-700">
        This policy explains what {name} collects through this website and what happens to it.
      </p>
      <Part title="What is collected">
        <p>Your name, mobile number and email, your appointments and purchases, anything you type into a booking or note, and your choice about text messages. Any address you give for a house call is kept too.</p>
        <p>Card details go straight to Stripe. They are not stored on this site or seen by {name}.</p>
        <p>The site uses the cookies and browser storage it needs to work.</p>
      </Part>
      <Part title="How it is used">
        <p>To book and manage your appointments, take payment, send the messages you asked for, keep your client record and answer your questions.</p>
      </Part>
      <Part title="Text messages and your mobile number">
        <p><strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> Text messaging opt-in data and consent are not shared with any third parties.</p>
        <p>Your number is passed only to the service providers needed to deliver your texts. Reply STOP to any text to stop them. The date of your agreement or refusal is kept as a record.</p>
      </Part>
      <Part title="Who else handles your information">
        <p>{name} never sells your information. It is handled only by the companies that run this service: Certxa (booking software and hosting), Stripe (card payments), Google Maps (to check the distance to a house call address), and the text message and email providers that deliver your messages. It may also be disclosed if the law requires it.</p>
      </Part>
      <Part title="How long it is kept, and your choices">
        <p>Your information is kept for as long as {name} needs it for your client record and for tax and business records. You can ask {name} to see, correct or delete it, using the details below.</p>
      </Part>
      <Part title="Children">
        <p>This site is not meant for children under 13, and their information is not knowingly collected.</p>
      </Part>
      <Part title="Changes">
        <p>This policy may change; the date at the top shows the latest version.</p>
      </Part>
      <Contact store={store} />
    </>
  );
}

/** Mount once on the site; it stays out of the way until the address is #terms or #privacy. */
export default function SiteLegal({ store }: { store: StoreData }) {
  const [doc, setDoc] = useState<Doc | null>(docFromHash);
  useEffect(() => {
    const open = () => setDoc(docFromHash());
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  if (!doc) return null;
  const close = () => { setDoc(null); window.history.replaceState(null, "", window.location.pathname + window.location.search); };
  const title = doc === "terms" ? "Terms of Service" : "Privacy Policy";
  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-testid="site-legal" className="fixed inset-0 z-[200] overflow-y-auto bg-white text-gray-900">
      <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <span className="truncate text-sm font-semibold">{store.name}</span>
        <button type="button" onClick={close} aria-label="Close" data-testid="site-legal-close" className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{store.name} · Last updated {UPDATED}</p>
        {doc === "terms" ? <Terms store={store} /> : <Privacy store={store} />}
      </div>
    </div>
  );
}
