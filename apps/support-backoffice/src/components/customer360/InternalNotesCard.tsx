import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Plus, Send } from "lucide-react";
import { api, type Note } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function InternalNotesCard({ accountId, full }: { accountId: number; full?: boolean }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["support-notes", accountId],
    queryFn: () => api.accounts.notes(accountId),
    staleTime: 30_000,
  });

  const addNote = useMutation({
    mutationFn: (c: string) => api.accounts.addNote(accountId, c),
    onSuccess: () => {
      setContent("");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["support-notes", accountId] });
    },
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote size={14} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700">Internal Notes</h3>
          {notes.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">{notes.length}</span>
          )}
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition font-medium"
        >
          <Plus size={12} />
          Add Note
        </button>
      </div>

      {/* Add Note Form */}
      {adding && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Add an internal note visible only to support agents…"
            className="w-full text-xs border border-amber-200 rounded-lg p-2.5 resize-none bg-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setAdding(false)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded transition">
              Cancel
            </button>
            <button
              onClick={() => content.trim() && addNote.mutate(content)}
              disabled={addNote.isPending || !content.trim()}
              className="flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition font-medium"
            >
              <Send size={11} />
              {addNote.isPending ? "Saving…" : "Save Note"}
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className={`overflow-y-auto scrollbar-thin ${full ? "max-h-[500px]" : "max-h-[200px]"}`}>
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="p-6 text-center">
            <StickyNote size={20} className="text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No notes yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notes.map(note => (
              <div key={note.id} className="px-4 py-3">
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-medium text-slate-500">{note.agent_name}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
