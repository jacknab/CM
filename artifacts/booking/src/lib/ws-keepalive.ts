/**
 * Keeps a /ws/notifications socket honest.
 *
 * After the Wi-Fi drops or changes, a tablet's socket can stay "open" while nothing gets through, and the screen
 * then never hears another change until it is reloaded (store 2, 2026-11-01: a check-in missing on /nail until a
 * hard refresh). The server answers every `ping` with a `pong`; a socket that has heard nothing for SILENT_MS is
 * closed and its own `onclose` is run straight away — closing a dead connection can otherwise wait a long time —
 * so the page reconnects the way it always does.
 *
 * Call right after creating the socket. Stops by itself when the socket closes; returns a stop function too.
 */
const PING_MS = 20_000;
const SILENT_MS = 50_000;

export function keepSocketAlive(sock: WebSocket): () => void {
  let lastHeard = Date.now();
  const heard = () => { lastHeard = Date.now(); };
  sock.addEventListener("open", heard);
  sock.addEventListener("message", heard);
  const timer = setInterval(() => {
    if (sock.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastHeard > SILENT_MS) {
      stop();
      const onclose = sock.onclose;
      sock.onclose = null;
      try { sock.close(); } catch { /* already gone */ }
      onclose?.call(sock, new CloseEvent("close"));
      return;
    }
    try { sock.send(JSON.stringify({ type: "ping", ts: Date.now() })); } catch { /* onclose reconnects */ }
  }, PING_MS);
  const stop = () => clearInterval(timer);
  sock.addEventListener("close", stop);
  return stop;
}
