import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useStoreId } from "@/hooks/use-store-id";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const isAdmin = useIsAdmin();
  const storeId = useStoreId();
  const isEditorPage = /^\/websites\/\d+\/edit/.test(location);

  const navLinks: { href: string; label: string; external?: boolean; disabled?: boolean }[] = [
    { href: "/templates", label: "Templates" },
    { href: "/websites", label: "My Websites" },
    { href: "/settings", label: "Settings" },
    // Gallery Manager — for any authenticated user with a storeId (admins included)
    ...(storeId ? [{ href: "/gallery", label: "Photo Gallery" }] : []),
    // Image Library — for platform admins only (template management)
    ...(isAdmin ? [{ href: "/image-library", label: "Image Library" }] : []),
  ];

  if (isEditorPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      <header className="sticky top-0 z-40 w-full h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 lg:px-10">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <span className="font-serif font-bold text-2xl text-[#3B0764] tracking-tight">Certxa<span className="text-[#C97B2B]">.</span></span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            link.disabled ? (
              <span key={link.label} className="text-sm font-medium text-gray-400 cursor-not-allowed">
                {link.label}
              </span>
            ) : link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-[#C97B2B]"
              >
                {link.label}
              </a>
            ) : (
              <Link 
                key={link.href} 
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-[#C97B2B] ${
                  location.startsWith(link.href) ? "text-[#C97B2B]" : "text-gray-600"
                }`}
              >
                {link.label}
              </Link>
            )
          ))}
        </nav>

        <div className="flex items-center">
          <a
            href="/manage"
            className="inline-flex items-center justify-center rounded-full bg-[#1A0333] text-white px-6 py-2.5 text-sm font-medium shadow-[0px_8px_32px_0px_rgba(201,123,43,0.25)] hover:bg-[#2b0554] transition-all"
          >
            Go to Dashboard
          </a>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-[#0F0A1A] text-white py-16 px-6 lg:px-10 border-t border-[#3B0764]/30">
        <div className="max-w-7xl mx-auto flex flex-col gap-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="flex flex-col gap-4">
              <span className="font-serif font-bold text-3xl tracking-tight text-white">Certxa<span className="text-white">.</span></span>
              <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
                Build your salon's online presence with beautiful, conversion-focused websites.
              </p>
            </div>
            
            <div className="flex flex-col gap-4">
              <h4 className="font-medium text-white mb-2">Platform</h4>
              <Link href="/templates" className="text-gray-400 hover:text-white text-sm transition-colors">Templates</Link>
              <Link href="/websites" className="text-gray-400 hover:text-white text-sm transition-colors">My Websites</Link>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Builder</span>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Publish</span>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-medium text-white mb-2">Company</h4>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">About</span>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Pricing</span>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Blog</span>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Support</span>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-medium text-white mb-2">Legal</h4>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Privacy Policy</span>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Terms</span>
              <span className="text-gray-400 hover:text-white text-sm transition-colors cursor-pointer">Cookie Policy</span>
            </div>
          </div>
          
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">© 2025 Certxa. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors" />
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors" />
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
