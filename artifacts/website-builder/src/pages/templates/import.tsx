import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useImportTemplate, getListTemplatesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileArchive,
  X,
  Loader2,
  Camera,
  Cpu,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import JSZip from "jszip";

export default function ImportTemplate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [base64, setBase64] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  const importTemplate = useImportTemplate();

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".zip")) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: "Please upload a ZIP file.",
      });
      return;
    }
    setFile(selectedFile);

    // Read ZIP as ArrayBuffer for JSZip parsing
    const arrayBuffer = await selectedFile.arrayBuffer();
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      // Try to find and read package.json
      const pkgFile = zip.file("package.json");
      let pkgText: string | undefined;
      if (pkgFile) {
        pkgText = await pkgFile.async("string");
        const pkg = JSON.parse(pkgText);
        if (pkg.name) {
          // Convert npm-style name (e.g. "my-template") to human-readable
          const readable = pkg.name
            .replace(/^@[^/]+\//, "") // strip scope
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          setName(readable);
        }
        if (pkg.description) {
          setDescription(pkg.description);
        }
        if (pkg.name || pkg.description) {
          setAutoDetected(true);
          toast({
            title: "Auto-detected",
            description: pkg.name
              ? `Template name and description were read from package.json`
              : "Template description was read from package.json",
          });
        }
      }
      // Also check README.md for description as fallback
      if (!pkgFile || !pkgText) {
        // Try parent directory package.json for monorepo layouts
        const parentPkg = zip.file("../package.json") || zip.file("project/package.json");
        if (parentPkg) {
          const parentText = await parentPkg.async("string");
          const pkg = JSON.parse(parentText);
          if (pkg.name && !name) {
            const readable = pkg.name
              .replace(/^@[^/]+\//, "")
              .replace(/[-_]/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            setName(readable);
          }
          if (pkg.description && !description) {
            setDescription(pkg.description);
          }
          if (pkg.name || pkg.description) setAutoDetected(true);
        }
      }
    } catch (err) {
      // ZIP parsing failed — silently fall through, user can type manually
      console.warn("Could not parse package.json from template ZIP:", err);
    }

    // Also read the file as base64 for the backend
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const b64 = result.split(",")[1];
      if (b64) setBase64(b64);
    };
    reader.readAsDataURL(selectedFile);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !autoDetected) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Template name is required or upload a ZIP with a package.json.",
      });
      return;
    }
    if (!file || !base64) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please upload a template ZIP file.",
      });
      return;
    }

    importTemplate.mutate(
      { data: { name, category: "nail_salon", description, zipBase64: base64 } },
      {
        onSuccess: () => {
          toast({
            title: "Template imported",
            description:
              "The template was saved. A preview screenshot is being generated in the background — it will appear on the catalog shortly.",
          });
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setLocation("/templates");
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Import failed",
            description: (err?.data as { error?: string })?.error ?? err?.message ?? "Unknown error",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="font-serif text-4xl font-bold text-[#3B0764] mb-3">
          Import Template
        </h1>
        <p className="text-gray-600 text-lg">
          Upload a React/Vite website template as a ZIP file. A live screenshot
          will be generated automatically after import.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            icon: Upload,
            title: "1. Upload ZIP",
            desc: "Drop your React/Vite template source as a ZIP archive",
          },
          {
            icon: Cpu,
            title: "2. Auto-build",
            desc: "The server installs dependencies and builds the template",
          },
          {
            icon: Camera,
            title: "3. Screenshot",
            desc: "A headless browser renders and captures the preview image",
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex flex-col items-center text-center p-5 rounded-2xl bg-gray-50 border border-gray-100"
          >
            <div className="w-11 h-11 rounded-full bg-[#3B0764]/10 flex items-center justify-center text-[#3B0764] mb-3">
              <Icon className="w-5 h-5" />
            </div>
            <p className="font-semibold text-gray-900 text-sm mb-1">{title}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden bg-white">
        <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-8">
          {/* ZIP drop zone */}
          <div className="space-y-3">
            <Label className="text-base font-semibold text-gray-900">
              Template ZIP File
            </Label>

            {!file ? (
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer select-none ${
                  isDragging
                    ? "border-[#C97B2B] bg-[#C97B2B]/5 scale-[1.01]"
                    : "border-gray-200 hover:border-[#3B0764]/40 hover:bg-gray-50"
                }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files?.[0]) processFile(e.target.files[0]);
                  }}
                  accept=".zip"
                  className="hidden"
                />
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${
                    isDragging
                      ? "bg-[#C97B2B]/20 text-[#C97B2B]"
                      : "bg-white shadow-sm text-[#3B0764]"
                  }`}
                >
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-gray-900 mb-1">
                  {isDragging ? "Drop to upload" : "Click to upload or drag and drop"}
                </h4>
                <p className="text-gray-400 text-sm">
                  ZIP file containing a React/Vite source project
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-4 bg-green-50 border-green-200">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                  <FileArchive className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB — ready to import
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-red-500 shrink-0"
                  onClick={() => {
                    setFile(null);
                    setBase64("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            )}
          </div>

          {/* Template name */}
          <div>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold text-gray-900">
                Template Name
                {autoDetected && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3" />
                    Auto-detected
                  </span>
                )}
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Blade Barbershop"
                className="rounded-lg h-12 bg-gray-50"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-semibold text-gray-900">
              Description{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this template's style and use case..."
              className="rounded-lg bg-gray-50 resize-none h-28"
            />
          </div>

          {/* Screenshot notice */}
          <div className="flex items-start gap-3 px-4 py-3 bg-[#3B0764]/5 border border-[#3B0764]/15 rounded-xl text-sm text-[#3B0764]">
            <Camera className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              After import, the server will automatically build the template and
              capture a screenshot using a headless browser. This usually takes
              30–90 seconds and happens in the background — you do not need to
              wait on this page.
            </span>
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-6 h-12"
              onClick={() => setLocation("/templates")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={importTemplate.isPending}
              className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white shadow-[0px_8px_32px_0px_rgba(201,123,43,0.25)] px-8 h-12"
            >
              {importTemplate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Import Template
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
