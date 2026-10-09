import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { supportApi, type FeedPost } from "@/lib/support-api";

// The support team's Home feed: posts written by a platform admin on /isadmin, newest first.
// Read-only here — agents cannot post, edit or comment.
export default function TeamHomePage() {
  const { data: posts, isLoading, error } = useQuery<FeedPost[]>({
    queryKey: ["support-feed"],
    queryFn: () => supportApi.feed(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-6 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Home</h1>
        </div>

        {isLoading && <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>}
        {error && <p className="text-sm text-red-600">Could not load the feed.</p>}
        {posts && posts.length === 0 && <p className="text-sm text-slate-400 py-8">No posts yet.</p>}

        <div className="space-y-5">
          {posts?.map((post) => (
            <article key={post.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">{post.title}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {format(new Date(post.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  {post.authorName ? ` · ${post.authorName}` : ""}
                </p>
              </div>
              <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{post.body}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
