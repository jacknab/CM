/**
 * SupportFeedManager — Admin page for the posts shown on the support team's Home page
 * (/isTeam/home). Posts appear there newest first. Agents can only read them.
 */
import { EMPTY_ARRAY } from "@/lib/empty";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface FeedPost {
  id: number;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  updatedAt: string | null;
}

const API = "/api/admin/support-feed";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PostForm({
  initial,
  submitLabel,
  isLoading,
  onSubmit,
  onCancel,
}: {
  initial?: { title: string; body: string };
  submitLabel: string;
  isLoading: boolean;
  onSubmit: (data: { title: string; body: string }, reset: () => void) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 block mb-1 font-medium">Title *</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="bg-white border-gray-300 text-gray-900" />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1 font-medium">Post *</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={20000}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="bg-violet-600 hover:bg-violet-500 text-white"
          disabled={!canSubmit || isLoading}
          onClick={() => onSubmit({ title: title.trim(), body: body.trim() }, () => { setTitle(""); setBody(""); })}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {submitLabel}
        </Button>
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>}
      </div>
    </div>
  );
}

export default function SupportFeedManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: posts = EMPTY_ARRAY, isLoading } = useQuery<FeedPost[]>({
    queryKey: [API],
    queryFn: () => apiFetch(API),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: [API] });
  const onError = (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; body: string }) => apiFetch(API, json("POST", data)),
    onSuccess: () => { refresh(); toast({ title: "Post published" }); },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; title: string; body: string }) => apiFetch(`${API}/${id}`, json("PATCH", data)),
    onSuccess: () => { refresh(); setEditingId(null); toast({ title: "Post saved" }); },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`${API}/${id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); toast({ title: "Post deleted" }); },
    onError,
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Feed</h1>
        <p className="text-sm text-gray-500 mt-1">Posts shown on the support team's Home page, newest first. Agents can read them but cannot post or comment.</p>
      </div>

      <Card className="bg-white border border-violet-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-gray-900 text-base">New Post</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <PostForm
            submitLabel="Publish"
            isLoading={createMutation.isPending}
            onSubmit={(data, reset) => createMutation.mutate(data, { onSuccess: reset })}
          />
        </CardContent>
      </Card>

      {isLoading && <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading posts…</div>}
      {!isLoading && posts.length === 0 && <p className="text-sm text-gray-400">No posts yet.</p>}

      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id} className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              {editingId === post.id ? (
                <PostForm
                  initial={{ title: post.title, body: post.body }}
                  submitLabel="Save"
                  isLoading={updateMutation.isPending}
                  onSubmit={(data) => updateMutation.mutate({ id: post.id, ...data })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 break-words">{post.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDateTime(post.createdAt)}
                        {post.authorName ? ` · ${post.authorName}` : ""}
                        {post.updatedAt ? ` · edited ${formatDateTime(post.updatedAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(post.id)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        disabled={deleteMutation.isPending}
                        onClick={() => { if (window.confirm(`Delete "${post.title}"? Agents will no longer see it.`)) deleteMutation.mutate(post.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap break-words">{post.body}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
