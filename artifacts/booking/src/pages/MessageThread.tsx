/**
 * A client's conversation with a Certxa Pro business (owner, 2026-11-07; plans/pro-messages.md): certxa.com/msg/<code>,
 * the link in the e-mails. The conversation itself is components/chat/ChatThread.tsx (also in the website's chat bubble).
 */
import { useParams } from "react-router-dom";
import ChatThread from "@/components/chat/ChatThread";

export default function MessageThread() {
  const { token = "" } = useParams();
  return <ChatThread token={token} variant="page" />;
}
