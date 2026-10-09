import { useCallback, useState } from "react";

// Unsent text that survives leaving the page: a ticket reply an agent was writing when a live chat
// came in, or a chat reply typed just before opening the client's account. Kept in this browser's
// localStorage under a key the caller chooses (one per ticket, one per chat) and removed as soon as
// the text is emptied — which is what sending does.

const PREFIX = "isteam-draft:";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function read(key: string | null): string {
  if (!key) return "";
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return "";
    const saved = JSON.parse(raw) as { text?: unknown };
    return typeof saved.text === "string" ? saved.text : "";
  } catch {
    return "";
  }
}

function write(key: string | null, text: string) {
  if (!key) return;
  try {
    if (text === "") localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify({ text, at: Date.now() }));
  } catch { /* storage full or unavailable — the text still lives in memory */ }
}

// Drafts for tickets and chats that were closed without the text ever being sent would otherwise
// stay forever. Runs once when the back office loads.
(function pruneOldDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const saved = JSON.parse(localStorage.getItem(k) ?? "{}") as { at?: unknown };
      if (typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
})();

/**
 * Like useState<string>(""), but the text is remembered per key. Pass null when there is nothing
 * to attach the text to yet (no chat selected): it then behaves like plain state.
 */
export function useDraft(key: string | null): [string, (value: string | ((prev: string) => string)) => void] {
  const [state, setState] = useState(() => ({ key, text: read(key) }));

  // The key changed (another ticket or chat was opened): switch to that one's draft in the same
  // render, so the previous text is never shown, or sent, against the wrong ticket or chat.
  let current = state;
  if (state.key !== key) {
    current = { key, text: read(key) };
    setState(current);
  }

  const setText = useCallback(
    (value: string | ((prev: string) => string)) => {
      setState((prev) => {
        const base = prev.key === key ? prev.text : read(key);
        const text = typeof value === "function" ? value(base) : value;
        write(key, text);
        return { key, text };
      });
    },
    [key],
  );

  return [current.text, setText];
}
