import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen, Globe, Palette, Image, Layout, Settings2, HelpCircle, Zap, CheckCircle2, Monitor, Smartphone } from "lucide-react";
import { Link } from "wouter";

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

function Accordion({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-5 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="shrink-0 w-9 h-9 rounded-xl bg-[#F3EEFF] flex items-center justify-center text-[#3B0764]">
          {section.icon}
        </span>
        <span className="flex-1 font-semibold text-gray-900">{section.title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-gray-100 bg-white prose-sm text-gray-700 leading-relaxed">
          {section.content}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mt-5">
      <div className="shrink-0 w-7 h-7 rounded-full bg-[#3B0764] text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div>
        <p className="font-semibold text-gray-800 mb-1">{title}</p>
        <div className="text-gray-600 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-[#F3EEFF] border border-[#E9D8FD] rounded-xl px-4 py-3 text-sm text-[#3B0764] flex gap-2">
      <Zap className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const sections: Section[] = [
  {
    id: "getting-started",
    icon: <Zap className="w-4 h-4" />,
    title: "Getting Started",
    content: (
      <div className="pt-4">
        <p>
          The CertXA Website Builder lets you create a professional salon website in minutes — no
          coding required. Your live site is hosted at <strong>yourname.certxa.com</strong> and can
          optionally use your own custom domain.
        </p>
        <Step n={1} title="Open the builder">
          Log in to your SalonOS dashboard and click <strong>Website Builder</strong> (or navigate
          to the builder URL your administrator provided).
        </Step>
        <Step n={2} title="Pick a template">
          Go to <strong>Templates</strong> in the top navigation. Browse the gallery, filter by
          salon type (Nail Salon, Barbershop, Hair Salon), and click a card to preview it
          full-screen. When you find one you like, click <strong>Use Template</strong>.
        </Step>
        <Step n={3} title="Name your site and choose a slug">
          Give your website a name (e.g. "Lumière Nail Studio") and pick your subdomain slug —
          this becomes <strong>yourslug.certxa.com</strong>. Slugs must be lowercase, 2–63
          characters, letters and numbers only.
        </Step>
        <Step n={4} title="Customize and publish">
          The editor opens automatically. Edit text, swap images, rearrange sections, then click{" "}
          <strong>Publish</strong>. Your site goes live immediately.
        </Step>
        <Tip>
          Your store data (name, phone, hours, services, staff) is auto-populated from SalonOS.
          You usually only need to review and adjust the look.
        </Tip>
      </div>
    ),
  },
  {
    id: "templates",
    icon: <Layout className="w-4 h-4" />,
    title: "Choosing & Previewing Templates",
    content: (
      <div className="pt-4 space-y-3 text-sm">
        <p>
          Templates are professionally designed, fully responsive salon websites. Each template is
          built for a specific salon type but can be used for any business.
        </p>
        <p className="font-semibold text-gray-800 mt-4">Filtering</p>
        <p>
          Use the category tabs (<strong>All · Nail Salon · Barbershop · Hair Salon</strong>) at
          the top of the Templates page to narrow results.
        </p>
        <p className="font-semibold text-gray-800 mt-4">Full-screen preview</p>
        <p>
          Click any template card thumbnail to open a full-screen interactive preview. You can
          scroll through the entire template as if it were a real website. Close the preview and
          pick a different template at any time — choosing a template is completely free.
        </p>
        <p className="font-semibold text-gray-800 mt-4">What "Processing…" means</p>
        <p>
          Newly imported templates show a <em>Processing…</em> badge while their preview thumbnail
          is being generated. This takes up to 30 seconds and refreshes automatically — you don't
          need to reload the page.
        </p>
        <Tip>
          You can switch to a different template at any time by creating a new website from it.
          Your existing sites are never deleted when you explore new templates.
        </Tip>
      </div>
    ),
  },
  {
    id: "visual-editor",
    icon: <Palette className="w-4 h-4" />,
    title: "Visual Editor — Text, Images & Layout",
    content: (
      <div className="pt-4 text-sm space-y-4">
        <p>
          The editor has three modes accessible from the toolbar inside the preview frame:{" "}
          <strong>Text</strong>, <strong>Images</strong>, and <strong>Layout</strong>. Switch
          between them freely — changes in one mode are independent of the others.
        </p>

        <p className="font-semibold text-gray-800">Text mode</p>
        <p>
          Click <strong>EDIT MODE</strong> in the preview toolbar, then hover over any text on the
          page. Editable fields highlight with a purple underline. Click to start typing. Press{" "}
          <kbd className="bg-gray-100 px-1 rounded text-xs">Enter</kbd> or click outside the field
          to save the change. The left panel shows all detected text fields and updates live as you
          type.
        </p>
        <p className="text-xs text-gray-500 italic">
          If a field doesn't appear in the left panel, try clicking <strong>Re-scan</strong> in the
          top bar to re-detect all text on the page.
        </p>

        <p className="font-semibold text-gray-800 mt-2">Images mode</p>
        <p>
          Switch to the <strong>Images</strong> tab. Hover over any image in the preview and click
          the camera icon that appears. A picker opens showing your Image Library — choose an
          existing image or upload a new one (JPEG, PNG, WebP up to 20 MB). The image swaps
          immediately.
        </p>

        <p className="font-semibold text-gray-800 mt-2">Layout mode</p>
        <p>
          Switch to the <strong>Layout</strong> tab. Hover any section to highlight it with a blue
          border. A blue toolbar appears at the top of the selected section with four actions:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
          <li><strong>Move up / Move down</strong> — reorder sections vertically</li>
          <li><strong>Duplicate</strong> — create an identical copy of the section</li>
          <li><strong>Delete</strong> — hide the section (confirm prompt shown)</li>
        </ul>
        <p>
          The <strong>+ ADD LAYOUT</strong> button appears at the top of the hovered section. Click
          it to open the block picker and insert a new section above the current one.
        </p>

        <Tip>
          Click <strong>Save</strong> in the top-right after any editing session. Changes are only
          persisted when you save — refreshing without saving discards edits.
        </Tip>
      </div>
    ),
  },
  {
    id: "images",
    icon: <Image className="w-4 h-4" />,
    title: "Image Library",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          The Image Library is a curated collection of salon photos you can use across all your
          websites. Images are organised into four categories: <strong>Nail Salon</strong>,{" "}
          <strong>Barbershop</strong>, <strong>Hair Salon</strong>, and <strong>Other</strong>.
        </p>
        <p className="font-semibold text-gray-800">Adding images</p>
        <p>
          From within the editor, click any image → camera icon → <strong>Upload new</strong>.
          Images are automatically saved to your library for reuse.
        </p>
        <p className="font-semibold text-gray-800">Supported formats</p>
        <p>JPEG, PNG, WebP, GIF, SVG — up to 20 MB per file.</p>
        <p className="font-semibold text-gray-800">Image quality tips</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
          <li>Hero images look best at 1440 × 800 px or wider.</li>
          <li>Staff headshots work best as square crops (1:1 ratio).</li>
          <li>Gallery photos should be at least 800 × 600 px.</li>
          <li>Use WebP format for the smallest file size without quality loss.</li>
        </ul>
        <Tip>
          The system can automatically harvest stock images from your template — ask your
          administrator to run the harvest tool to pre-fill your library.
        </Tip>
      </div>
    ),
  },
  {
    id: "publishing",
    icon: <Globe className="w-4 h-4" />,
    title: "Publishing Your Website",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          Publishing makes your website publicly accessible. Unpublishing takes it offline without
          deleting it.
        </p>
        <p className="font-semibold text-gray-800">How to publish</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
          <li>Open any website from <strong>My Websites</strong>.</li>
          <li>Click <strong>Publish</strong> in the top-right of the editor.</li>
          <li>Your site is immediately live at <strong>yourslug.certxa.com</strong>.</li>
        </ol>
        <p className="font-semibold text-gray-800 mt-2">Subdomain slugs</p>
        <p>
          Your slug is the part before <em>.certxa.com</em>. You choose it when creating the
          website and cannot change it afterwards. Choose something short and memorable — ideally
          your salon name or neighbourhood (e.g. <em>lumiere</em>, <em>tobys-denver</em>).
        </p>
        <p className="font-semibold text-gray-800 mt-2">Unpublishing</p>
        <p>
          Click <strong>Unpublish</strong> in the editor. The site goes offline immediately but all
          your content and settings are preserved.
        </p>
        <Tip>
          After publishing, share your link on Google Business Profile, Instagram bio, and
          Facebook page to start driving traffic immediately.
        </Tip>
      </div>
    ),
  },
  {
    id: "custom-domains",
    icon: <Globe className="w-4 h-4" />,
    title: "Custom Domains (BYOD)",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          Connect your own domain (e.g. <em>lumierenails.com</em>) so visitors see your brand, not
          <em>.certxa.com</em>. This is an optional add-on available from the website editor.
        </p>
        <Step n={1} title='Click "Custom Domain" in the editor'>
          Open the website editor and click the <strong>Custom Domain</strong> button in the top bar.
        </Step>
        <Step n={2} title="Enter your domain">
          Type your domain (e.g. <em>www.lumierenails.com</em>) and click <strong>Connect</strong>.
        </Step>
        <Step n={3} title="Add a DNS record">
          Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) and add a{" "}
          <strong>CNAME record</strong> pointing your domain to{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">certxa.com</code>. DNS changes take
          5 minutes to 48 hours to propagate.
        </Step>
        <Step n={4} title="Verify and activate">
          Come back to the editor and click <strong>Verify DNS</strong>. Once the check passes,
          your custom domain is active with HTTPS included automatically.
        </Step>
        <Tip>
          Using Cloudflare? Set your DNS record to <strong>DNS only</strong> (grey cloud) during
          initial setup. You can enable the proxy (orange cloud) after the domain is verified.
        </Tip>
      </div>
    ),
  },
  {
    id: "purchased-subdomains",
    icon: <Globe className="w-4 h-4" />,
    title: "Purchased Subdomains",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          Need a different <em>.certxa.com</em> address than the one you chose when creating your
          site? You can purchase additional subdomains and assign them to any of your websites.
        </p>
        <p className="font-semibold text-gray-800">How it works</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
          <li>Go to <strong>My Websites</strong> and click the subdomain option on a website card.</li>
          <li>Search for an available subdomain and purchase it ($10/year).</li>
          <li>After payment, assign it to any of your websites.</li>
          <li>Your site is immediately accessible at the new address.</li>
        </ol>
        <p className="text-xs text-gray-500 italic mt-2">
          Purchased subdomains auto-renew annually. Cancel at any time from your billing settings.
        </p>
      </div>
    ),
  },
  {
    id: "mobile-preview",
    icon: <Smartphone className="w-4 h-4" />,
    title: "Mobile & Desktop Preview",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          All templates are fully responsive — they automatically adapt to phones, tablets, and
          desktops. You can preview both layouts inside the editor.
        </p>
        <p>
          In the editor, click the <strong>desktop icon</strong> or <strong>mobile icon</strong>{" "}
          in the preview toolbar (top-right of the preview frame) to switch between views.
        </p>
        <p>
          The mobile view shows your site at 390 px width — the standard iPhone viewport. Check
          that hero text is readable, buttons are large enough to tap, and images aren't cropped
          in an unflattering way.
        </p>
        <Tip>
          Google ranks mobile-friendly sites higher in search results. Always check the mobile view
          before publishing.
        </Tip>
      </div>
    ),
  },
  {
    id: "live-data",
    icon: <Zap className="w-4 h-4" />,
    title: "Auto-Fill from SalonOS (Live Data)",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          Your website automatically pulls live data from your SalonOS account, so you don't have
          to re-enter information that's already in your system.
        </p>
        <p className="font-semibold text-gray-800">What's auto-populated</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
          <li><strong>Business name, address, phone, email</strong> — from your location profile</li>
          <li><strong>Opening hours</strong> — from your business hours settings</li>
          <li><strong>Services &amp; prices</strong> — from your service menu</li>
          <li><strong>Staff</strong> — active team members with their photos and bios</li>
          <li><strong>Google reviews</strong> — top-rated reviews (4–5 stars, published)</li>
          <li><strong>Booking link</strong> — your SalonOS online booking URL</li>
        </ul>
        <p className="font-semibold text-gray-800 mt-2">When does it update?</p>
        <p>
          Data is refreshed nightly. If you update your hours or add a new service in SalonOS
          today, your website will reflect the change within 24 hours automatically.
        </p>
        <Tip>
          Keep your SalonOS profile complete and up to date — it's the single source of truth for
          your website content.
        </Tip>
      </div>
    ),
  },
  {
    id: "settings",
    icon: <Settings2 className="w-4 h-4" />,
    title: "Settings Page Overview",
    content: (
      <div className="pt-4 text-sm space-y-3">
        <p>
          The <Link href="/settings" className="text-[#3B0764] underline">Settings page</Link>{" "}
          gives you a snapshot of your account and quick access to important areas.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-600 ml-2">
          <li>
            <strong>Store ID</strong> — your unique account identifier. Needed if you contact
            support.
          </li>
          <li>
            <strong>Websites used</strong> — how many of your allowed sites you've created.
          </li>
          <li>
            <strong>Live website</strong> — a quick link to your currently published site.
          </li>
          <li>
            <strong>Custom Domains</strong> — status of any BYOD domains you've connected.
          </li>
          <li>
            <strong>My Websites</strong> — a quick list linking directly to each website editor.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: "faq",
    icon: <HelpCircle className="w-4 h-4" />,
    title: "Frequently Asked Questions",
    content: (
      <div className="pt-4 text-sm space-y-5">
        {[
          {
            q: "Can I have more than one website?",
            a: "Yes — your plan allows up to 5 websites. Each one is independent and can use a different template, slug, and domain.",
          },
          {
            q: "Can I change my template after publishing?",
            a: "Not on the same website — templates are set at creation time. To try a new template, create a new website from it. Your original site stays live until you unpublish it.",
          },
          {
            q: "My text edits aren't showing on the live site.",
            a: "Make sure you clicked Save after editing. Then visit your live URL and do a hard refresh (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac) to bypass your browser cache.",
          },
          {
            q: "The editor shows 'No fields detected'.",
            a: "Click Re-scan in the top bar. If the template uses very dynamic JavaScript rendering, the scanner may need a moment for the page to fully load before it can detect editable fields.",
          },
          {
            q: "My custom domain shows a security warning.",
            a: "SSL certificates are issued automatically but can take up to 10 minutes after DNS verification. If the warning persists after 30 minutes, contact support with your domain name and Store ID.",
          },
          {
            q: "Can I use the same custom domain on multiple websites?",
            a: "No — each domain can only be assigned to one website at a time. You can reassign a domain to a different website from the editor.",
          },
          {
            q: "How do I cancel a purchased subdomain?",
            a: "Contact support with your Store ID and the subdomain you want to cancel. Cancellations stop renewal at the end of the current billing year.",
          },
          {
            q: "Is my website mobile-friendly?",
            a: "Yes — all templates are fully responsive and tested on iOS and Android. Use the mobile preview icon in the editor to see exactly how it looks on a phone.",
          },
        ].map(({ q, a }) => (
          <div key={q}>
            <p className="font-semibold text-gray-800 mb-1">{q}</p>
            <p className="text-gray-600">{a}</p>
          </div>
        ))}
      </div>
    ),
  },
];

export default function Docs() {
  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-8">
      <div>
        <div className="inline-flex items-center gap-2 bg-[#F3EEFF] text-[#3B0764] text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          <BookOpen className="w-3.5 h-3.5" />
          Documentation
        </div>
        <h1 className="font-serif text-4xl lg:text-5xl font-bold text-[#3B0764] mb-3">
          User Guide
        </h1>
        <p className="text-gray-600 text-lg max-w-2xl">
          Everything you need to build, customize, and publish your salon website — from choosing a
          template to connecting your own domain.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Getting Started", id: "getting-started", icon: <Zap className="w-4 h-4" /> },
          { label: "Visual Editor", id: "visual-editor", icon: <Palette className="w-4 h-4" /> },
          { label: "Publishing", id: "publishing", icon: <Globe className="w-4 h-4" /> },
          { label: "Custom Domains", id: "custom-domains", icon: <Globe className="w-4 h-4" /> },
          { label: "Live Data", id: "live-data", icon: <Zap className="w-4 h-4" /> },
          { label: "FAQ", id: "faq", icon: <HelpCircle className="w-4 h-4" /> },
        ].map(({ label, id, icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-100 shadow-sm text-sm font-medium text-gray-700 hover:bg-[#F3EEFF] hover:border-[#E9D8FD] hover:text-[#3B0764] transition-colors"
          >
            <span className="text-[#3B0764]">{icon}</span>
            {label}
          </a>
        ))}
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <div id={s.id} key={s.id}>
            <Accordion section={s} />
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="rounded-2xl border border-[#E9D8FD] bg-[#F3EEFF] px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-[#3B0764]">Still have questions?</p>
          <p className="text-sm text-[#6B21A8]">
            Our support team is here to help you get set up.
          </p>
        </div>
        <Link
          href="/support"
          className="shrink-0 bg-[#3B0764] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#4C0F85] transition-colors"
        >
          Contact Support
        </Link>
      </div>
    </div>
  );
}
