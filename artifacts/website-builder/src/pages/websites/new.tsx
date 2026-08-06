import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useCreateWebsite,
  useListTemplates,
  useCheckSlug,
  useListWebsites,
  getListWebsitesQueryKey,
  getCheckSlugQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, LayoutTemplate } from "lucide-react";

export default function CreateWebsite() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [slug, setSlug] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  // Pre-selected template from query param
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tid = searchParams.get("templateId");
    if (tid) setTemplateId(parseInt(tid, 10));
  }, []);

  const { data: templates } = useListTemplates({ category: "nail_salon" });
  const { data: websites, isLoading: websitesLoading } = useListWebsites();
  const createWebsite = useCreateWebsite();

  const userWebsites = websites ?? [];
  const existingSlug = userWebsites.length > 0 ? userWebsites[0].slug : null;

  // If user already has a subdomain, lock it in
  useEffect(() => {
    if (existingSlug && !slug) {
      setSlug(existingSlug);
      setSlugStatus("available");
    }
  }, [existingSlug, slug]);

  // Slug formatting
  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (existingSlug) return;
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(val);
    setSlugStatus(val.length > 0 ? "checking" : "idle");
  };

  // Debounced slug check
  const [debouncedSlug, setDebouncedSlug] = useState("");
  useEffect(() => {
    if (existingSlug) return;
    const timer = setTimeout(() => setDebouncedSlug(slug), 500);
    return () => clearTimeout(timer);
  }, [slug, existingSlug]);

  const { data: checkResult } = useCheckSlug(
    { slug: debouncedSlug },
    {
      query: {
        queryKey: getCheckSlugQueryKey({ slug: debouncedSlug }),
        enabled: !existingSlug && debouncedSlug.length > 0,
      },
    }
  );

  useEffect(() => {
    if (existingSlug) return;
    if (debouncedSlug.length === 0) {
      setSlugStatus("idle");
    } else if (checkResult) {
      setSlugStatus(checkResult.available ? "available" : "taken");
    }
  }, [debouncedSlug, checkResult, existingSlug]);

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();

    if (!slug.trim()) {
      toast({ variant: "destructive", title: "Enter a URL", description: "Please enter a subdomain for your website." });
      return;
    }

    if (slugStatus !== "available") {
      toast({ variant: "destructive", title: "URL unavailable", description: "Please choose an available subdomain." });
      return;
    }

    if (!templateId) {
      toast({ variant: "destructive", title: "No template selected", description: "Please go back and select a template." });
      return;
    }

    // Auto-generate a name from the slug
    const autoName = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "My Website";

    createWebsite.mutate(
      {
        data: {
          name: autoName,
          slug,
          templateId,
          content: {},
          publisherType: "template",
          autoSettings: {},
        },
      },
      {
        onSuccess: (res) => {
          toast({ title: "Website created!", description: "Taking you to the builder…" });
          queryClient.invalidateQueries({ queryKey: getListWebsitesQueryKey() });
          setLocation(`/websites/${res.id}/edit`);
        },
        onError: (err) => {
          const data = err?.data as { error?: string } | undefined;
          toast({
            variant: "destructive",
            title: "Couldn't create website",
            description: data?.error || err?.message || "Unknown error",
          });
        },
      }
    );
  };

  const handleChangeLater = () => {
    if (!templateId) {
      toast({ variant: "destructive", title: "No template selected", description: "Please go back and select a template." });
      return;
    }

    const autoSlug = "my-salon-" + Math.random().toString(36).slice(2, 7);
    const autoName = "My Salon";

    createWebsite.mutate(
      {
        data: {
          name: autoName,
          slug: autoSlug,
          templateId,
          content: {},
          publisherType: "template",
          autoSettings: {},
        },
      },
      {
        onSuccess: (res) => {
          toast({ title: "Website created!", description: "You can update your URL from settings." });
          queryClient.invalidateQueries({ queryKey: getListWebsitesQueryKey() });
          setLocation(`/websites/${res.id}/edit`);
        },
        onError: (err) => {
          const data = err?.data as { error?: string } | undefined;
          toast({
            variant: "destructive",
            title: "Couldn't create website",
            description: data?.error || err?.message || "Unknown error",
          });
        },
      }
    );
  };

  // Find the selected template thumbnail
  const selectedTemplate = templates?.find((t) => t.id === templateId);
  const previewImage = selectedTemplate?.thumbnail ?? null;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="font-serif font-bold text-2xl text-[#3B0764] tracking-tight">
          Certxa<span className="text-[#C97B2B]">.</span>
        </span>
        <Link href="/templates">
          <button className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </Link>
      </div>

      {/* Main content — two-column */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <form
          onSubmit={handleClaim}
          className="flex flex-col justify-between w-full max-w-lg px-10 md:px-16 py-12"
        >
          <div className="flex flex-col gap-8">
            {/* Heading */}
            <div>
              {selectedTemplate && (
                <p className="text-sm font-semibold text-[#C97B2B] mb-2 uppercase tracking-widest">
                  {selectedTemplate.name}
                </p>
              )}
              <h1 className="text-3xl font-bold text-gray-900 leading-snug mb-2">
                Stunning website!<br />Now let's claim your URL.
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                This is the URL for your new website. You can always change it later from your settings.
              </p>
            </div>

            {/* URL input */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:border-[#3B0764] focus-within:ring-2 focus-within:ring-[#3B0764]/20 transition-all">
                <div className="flex flex-col justify-center px-4 py-3 bg-gray-50 border-r border-gray-200 shrink-0">
                  <span className="text-xs text-gray-400 font-medium leading-none mb-0.5">URL</span>
                </div>
                <Input
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder="my-salon"
                  readOnly={!!existingSlug}
                  maxLength={35}
                  className={`border-0 rounded-none shadow-none focus-visible:ring-0 text-base h-12 flex-1 bg-transparent ${
                    existingSlug ? "text-gray-500 cursor-not-allowed" : ""
                  }`}
                />
                <div className="flex items-center gap-2 pr-4 shrink-0">
                  {!existingSlug && slugStatus === "checking" && (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  )}
                  {!existingSlug && slugStatus === "available" && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {!existingSlug && slugStatus === "taken" && (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-gray-400 text-sm font-medium whitespace-nowrap">.certxa.com</span>
                </div>
              </div>

              {slugStatus === "taken" && (
                <p className="text-red-500 text-sm">This URL is already taken. Try a different one.</p>
              )}
              {existingSlug && (
                <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Your subdomain is locked to <strong>{existingSlug}.certxa.com</strong> — all your websites share one subdomain.
                </p>
              )}
            </div>

            {/* Rules */}
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                We recommend shorter URLs, so clients can easily remember them.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                35-character limit.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                May contain lowercase letters, numbers, and hyphens.
              </li>
            </ul>
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center justify-between pt-8 border-t border-gray-100 mt-8">
            <Link href="/templates">
              <button
                type="button"
                className="px-6 py-2.5 rounded-full border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
            </Link>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleChangeLater}
                disabled={createWebsite.isPending || websitesLoading}
                className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Change later
              </button>
              <button
                type="submit"
                disabled={
                  createWebsite.isPending ||
                  websitesLoading ||
                  (!existingSlug && slugStatus !== "available") ||
                  !slug
                }
                className="px-8 py-2.5 rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {createWebsite.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Claim
              </button>
            </div>
          </div>
        </form>

        {/* Right panel — template preview */}
        <div className="hidden md:flex flex-1 bg-gray-50 items-center justify-center overflow-hidden relative border-l border-gray-100">
          {previewImage ? (
            <img
              src={previewImage}
              alt={selectedTemplate?.name ?? "Template preview"}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-gray-300">
              <LayoutTemplate className="w-20 h-20" />
              <p className="text-sm font-medium">Template preview</p>
            </div>
          )}
          {/* Subtle vignette overlay at the bottom */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-gray-50/60 to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
