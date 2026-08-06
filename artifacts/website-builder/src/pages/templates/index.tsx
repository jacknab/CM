import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useListTemplates,
  useDeleteTemplate,
  useGetTemplate,
  getListTemplatesQueryKey,
  getGetTemplateQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, LayoutTemplate, Trash2, RefreshCw, Eye, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/use-is-admin";
import type { TemplateCategory } from "@workspace/api-client-react";

const CATEGORY_LABELS: Record<string, string> = {
  hair_salon: "Hair Salon",
  barbershop: "Barbershop",
  nail_salon: "Nail Salon",
};

const CATEGORY_COLORS: Record<string, string> = {
  hair_salon: "bg-purple-100 text-purple-700",
  barbershop: "bg-blue-100 text-blue-700",
  nail_salon: "bg-pink-100 text-pink-700",
};

interface TemplateWithStatus {
  buildStatus?: string | null;
  buildError?: string | null;
}

// Polls a single template until it has a thumbnail or a max retries hit
function ThumbnailPoller({
  id,
  onResolved,
}: {
  id: number;
  onResolved: () => void;
}) {
  const { data } = useGetTemplate(id, {
    query: {
      queryKey: getGetTemplateQueryKey(id),
      refetchInterval: 4000,
      refetchIntervalInBackground: true,
    },
  });

  useEffect(() => {
    if (data?.thumbnail) {
      onResolved();
    }
  }, [data?.thumbnail, onResolved]);

  return null;
}

export default function Templates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();

  const { data: templates, isLoading, refetch } = useListTemplates({ category: "nail_salon" });

  const deleteTemplate = useDeleteTemplate();

  // IDs of templates that are currently processing (building, not failed)
  const processingIds = (templates ?? [])
    .filter((t) => !t.thumbnail && (t as unknown as TemplateWithStatus).buildStatus !== "failed")
    .map((t) => t.id);

  const handleRetrigger = async (id: number) => {
    try {
      await fetch(`/api/templates/${id}/retrigger-screenshot`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
      toast({ title: "Retrying build…", description: "The template will be rebuilt and screenshotted." });
    } catch {
      toast({ variant: "destructive", title: "Could not retry", description: "Failed to trigger rebuild." });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    deleteTemplate.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Template deleted successfully" });
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to delete",
            description: (err?.data as { error?: string })?.error ?? err?.message ?? "Unknown error",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-10">
      {/* Pollers — invisible, just trigger refetch when thumbnails arrive */}
      {processingIds.map((id) => (
        <ThumbnailPoller
          key={id}
          id={id}
          onResolved={() =>
            queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() })
          }
        />
      ))}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="font-serif text-4xl lg:text-5xl font-bold text-[#3B0764] mb-3">
            Template Library
          </h1>
          <p className="text-gray-600 text-lg">
            Browse and manage website templates for your salons.
          </p>
        </div>
        {isAdmin && (
          <Link href="/templates/import">
            <Button className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white shadow-[0px_8px_32px_0px_rgba(201,123,43,0.25)] h-11 px-6">
              <Download className="w-4 h-4 mr-2" />
              Import Template
            </Button>
          </Link>
        )}
      </div>

      {/* Nail salon is the fixed website-builder business type. */}
      <div>
        {/* Loading skeletons */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80 rounded-2xl" />
            ))}
          </div>
        ) : !templates || templates.length === 0 ? (
          /* Empty state */
          <div className="rounded-3xl border-dashed border-2 bg-gray-50 flex flex-col items-center justify-center py-24 text-center">
            <LayoutTemplate className="w-16 h-16 text-gray-300 mb-6" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No templates found</h3>
            <p className="text-gray-500 mb-8 max-w-md">
              {isAdmin
                ? "There are no templates in this category. Import a template to get started."
                : "There are no templates in this category yet. Check back soon."}
            </p>
            {isAdmin && (
              <Link href="/templates/import">
                <Button className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white">
                  Import Template
                </Button>
              </Link>
            )}
          </div>
        ) : (
          /* Template grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="rounded-2xl border-gray-100 shadow-sm overflow-hidden flex flex-col bg-white group hover:shadow-md transition-shadow duration-200"
              >
                {/* Thumbnail area */}
                <div className="aspect-[16/10] bg-gray-100 relative overflow-hidden">
                  {template.thumbnail ? (
                    <>
                      <img
                        src={template.thumbnail}
                        alt={template.name}
                        className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      {/* Hover overlay — click thumbnail area to open in-app preview */}
                      <Link
                        href={`/templates/${template.id}/preview`}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100"
                        aria-label={`Open live preview of ${template.name}`}
                      >
                        <span className="bg-white/90 backdrop-blur-sm text-[#3B0764] font-semibold px-5 py-2.5 rounded-full text-sm flex items-center gap-2 shadow-lg hover:bg-white transition-colors">
                          <Eye className="w-4 h-4" />
                          Open Live Preview
                        </span>
                      </Link>
                    </>
                  ) : (template as unknown as TemplateWithStatus).buildStatus === "failed" ? (
                    /* Failed state */
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-red-50 to-red-100/60">
                      <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center">
                        <AlertCircle className="w-7 h-7 text-red-500" />
                      </div>
                      <div className="text-center px-6">
                        <p className="text-sm font-semibold text-gray-700">Build failed</p>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {(template as unknown as TemplateWithStatus).buildError?.slice(-100) ?? "Template could not be built"}
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleRetrigger(template.id); }}
                          className="text-xs text-red-600 hover:text-red-800 font-semibold underline underline-offset-2 transition-colors"
                        >
                          Retry build
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Processing state */
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-gray-50 to-gray-100">
                      <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center">
                        <RefreshCw className="w-7 h-7 text-[#3B0764] animate-spin" />
                      </div>
                      <div className="text-center px-6">
                        <p className="text-sm font-semibold text-gray-700">
                          Generating preview...
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Building and screenshotting template
                        </p>
                      </div>
                    </div>
                  )}

                </div>

                {/* Card body */}
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-gray-900 mb-2 line-clamp-1">
                    {template.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 flex-1 line-clamp-2">
                    {template.description ?? "No description provided."}
                  </p>

                  <div className="flex items-center gap-2 mt-auto">
                    <Link
                      href={`/templates/${template.id}/preview`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    >
                      <Button
                        variant="outline"
                        className="rounded-full border-gray-200 text-[#3B0764] hover:bg-[#3B0764]/5 hover:border-[#3B0764]/30 gap-1.5 px-4"
                        disabled={!template.thumbnail}
                        title={!template.thumbnail ? "Preview still generating…" : "Open full live preview"}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </Button>
                    </Link>
                    <Link
                      href={`/websites/new?templateId=${template.id}`}
                      className="flex-1"
                    >
                      <Button
                        className="w-full rounded-full bg-[#3B0764] hover:bg-[#2b0554] text-white"
                        disabled={!template.thumbnail}
                        title={!template.thumbnail ? "Preview is still being generated" : undefined}
                      >
                        Build My Site →
                      </Button>
                    </Link>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full border-gray-200 text-red-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 shrink-0"
                        onClick={() => handleDelete(template.id)}
                        disabled={deleteTemplate.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Processing notice */}
      {processingIds.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-amber-600" />
          <span>
            <strong>{processingIds.length}</strong> template
            {processingIds.length > 1 ? "s are" : " is"} being built and screenshotted in
            the background. This page will update automatically when complete.
          </span>
          <button
            className="ml-auto text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
            onClick={() => refetch()}
          >
            Refresh now
          </button>
        </div>
      )}
    </div>
  );
}
