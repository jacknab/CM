/**
 * The salon's local hub: how this salon's tablets reach each other over its own Wi-Fi when the internet
 * is down.
 *
 * The main POS tablet listens on the local network. The customer-facing screen and the kiosk connect to
 * it. Whatever one tablet's screen sends is passed to every other tablet's screen, which is all the
 * server does for these messages when it is reachable — so the same checkout, tip and check-in messages
 * keep flowing with no internet.
 *
 * Messages are one JSON object per line. A tablet must first say the salon's hub token (given to every
 * signed-in tablet by the server while online); anything else on the Wi-Fi is disconnected. The traffic is
 * not encrypted: it stays on the salon's own network.
 */
import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';

export const HUB_PORT = 9477;
const MAX_LINE = 512 * 1024;
const RECONNECT_MS = 4_000;
/** A connection the main POS has not welcomed by then is dropped and tried again (it would otherwise wait forever). */
const WELCOME_MS = 8_000;

export type HubStatus = 'off' | 'serving' | 'connecting' | 'connected';
export type HubEvent =
  | { kind: 'message'; message: unknown }
  | { kind: 'status'; status: HubStatus; peers: number; address: string | null };

type Socket = ReturnType<typeof TcpSocket.createConnection>;
type Listener = (event: HubEvent) => void;

/** Splits a stream into lines; calls `onLine` for each complete one. */
function lineReader(onLine: (line: string) => void, onOverflow: () => void) {
  let buffer = '';
  return (chunk: string | { toString(encoding?: string): string }) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (buffer.length > MAX_LINE) { buffer = ''; onOverflow(); return; }
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (line) onLine(line);
    }
  };
}

class LocalHub {
  private listeners = new Set<Listener>();
  private server: ReturnType<typeof TcpSocket.createServer> | null = null;
  /** Tablets connected to this one (when serving) that have given the right token. */
  private peers = new Set<Socket>();
  private client: Socket | null = null;
  private clientReady = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private token = '';
  private host: string | null = null;
  private mode: 'off' | 'serve' | 'join' = 'off';
  private address: string | null = null;

  onEvent(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(event: HubEvent) { this.listeners.forEach((fn) => { try { fn(event); } catch { /* a listener must not break the hub */ } }); }

  status(): HubStatus {
    if (this.mode === 'serve') return this.server ? 'serving' : 'off';
    if (this.mode === 'join') return this.clientReady ? 'connected' : 'connecting';
    return 'off';
  }
  private report() { this.emit({ kind: 'status', status: this.status(), peers: this.peers.size, address: this.address }); }

  /** This tablet's address on the salon's network, for the other tablets to connect to. */
  async localAddress(): Promise<string | null> {
    try {
      const ip = await Network.getIpAddressAsync();
      return ip && ip !== '0.0.0.0' ? ip : null;
    } catch {
      return null;
    }
  }

  /** Main POS tablet: accept the salon's other tablets. */
  async serve(token: string): Promise<void> {
    if (this.mode === 'serve' && this.token === token && this.server) return;
    this.stop();
    this.mode = 'serve';
    this.token = token;
    this.address = await this.localAddress();
    const server = TcpSocket.createServer((socket: Socket) => {
      let admitted = false;
      const read = lineReader((line) => {
        let msg: any;
        try { msg = JSON.parse(line); } catch { return; }
        if (!admitted) {
          if (msg?.hello === this.token && this.token) { admitted = true; this.peers.add(socket); socket.write(JSON.stringify({ welcome: true }) + '\n'); this.report(); }
          else socket.destroy();
          return;
        }
        if (msg?.message === undefined) return;
        // To this tablet's own screen, and on to every other tablet.
        this.emit({ kind: 'message', message: msg.message });
        this.broadcast(msg.message, socket);
      }, () => socket.destroy());
      socket.on('data', read);
      const gone = () => { if (this.peers.delete(socket)) this.report(); };
      socket.on('close', gone);
      socket.on('error', gone);
    });
    server.on('error', () => { /* keep the app running; the screen is told the hub is off */ this.server = null; this.report(); });
    server.listen({ port: HUB_PORT, host: '0.0.0.0', reuseAddress: true }, () => { this.server = server; this.report(); });
  }

  /** Customer screen or kiosk: connect to the main POS tablet and keep trying while it is unreachable. */
  join(host: string, token: string): void {
    if (this.mode === 'join' && this.host === host && this.token === token) return;
    this.stop();
    this.mode = 'join';
    this.host = host;
    this.token = token;
    this.connect();
  }

  private connect() {
    if (this.mode !== 'join' || !this.host) return;
    const socket = TcpSocket.createConnection({ port: HUB_PORT, host: this.host }, () => {
      socket.write(JSON.stringify({ hello: this.token }) + '\n');
    });
    this.client = socket;
    const unanswered = setTimeout(() => { if (this.client === socket && !this.clientReady) socket.destroy(); }, WELCOME_MS);
    const read = lineReader((line) => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg?.welcome) { clearTimeout(unanswered); this.clientReady = true; this.report(); return; }
      if (msg?.message !== undefined) this.emit({ kind: 'message', message: msg.message });
    }, () => socket.destroy());
    socket.on('data', read);
    const lost = () => {
      clearTimeout(unanswered);
      if (this.client !== socket) return;
      this.client = null;
      this.clientReady = false;
      this.report();
      if (this.mode === 'join') this.retry = setTimeout(() => this.connect(), RECONNECT_MS);
    };
    socket.on('close', lost);
    socket.on('error', lost);
    this.report();
  }

  private broadcast(message: unknown, except?: Socket) {
    const line = JSON.stringify({ message }) + '\n';
    this.peers.forEach((peer) => { if (peer !== except) { try { peer.write(line); } catch { /* dropped on close */ } } });
  }

  /** From this tablet's screen to every other tablet. False when nobody could be reached. */
  send(message: unknown): boolean {
    if (this.mode === 'serve') { this.broadcast(message); return this.peers.size > 0; }
    if (this.mode === 'join' && this.client && this.clientReady) {
      try { this.client.write(JSON.stringify({ message }) + '\n'); return true; } catch { return false; }
    }
    return false;
  }

  stop() {
    if (this.retry) { clearTimeout(this.retry); this.retry = null; }
    this.peers.forEach((p) => { try { p.destroy(); } catch { /* already closed */ } });
    this.peers.clear();
    try { this.server?.close(); } catch { /* already closed */ }
    this.server = null;
    try { this.client?.destroy(); } catch { /* already closed */ }
    this.client = null;
    this.clientReady = false;
    this.mode = 'off';
    this.host = null;
  }
}

export const localHub = new LocalHub();
