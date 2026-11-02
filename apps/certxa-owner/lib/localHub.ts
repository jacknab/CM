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
/** Failed tries at the saved address before the Wi-Fi is searched for the hub. */
const FAILS_BEFORE_SEARCH = 3;
/** A search that found nothing is not run again for this long (the saved address is still tried meanwhile). */
const SEARCH_AGAIN_MS = 60_000;
/** Addresses tried at once during a search, and how long each gets to answer. */
const SEARCH_BATCH = 32;
const PROBE_MS = 1_500;

export type HubStatus = 'off' | 'serving' | 'connecting' | 'connected';
export type HubEvent =
  | { kind: 'message'; message: unknown }
  | { kind: 'status'; status: HubStatus; peers: number; address: string | null }
  /** The hub was found at a new address (its tablet was given another one by the router): saved by the screen. */
  | { kind: 'found'; address: string };

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
  /** Failed tries per saved hub address. Kept across stop(): the screen restarts the link every 20 s while it is down. */
  private failures = new Map<string, number>();
  private searching = false;
  private lastSearchAt = 0;

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
    // Already serving: a page that has just loaded (or reloaded) asks again and must be told, or it believes the
    // hub is off and keeps trying to start it (store 38, 2026-11-02: Devices showed the main POS "Off" while the
    // customer screen was connected to it).
    if (this.mode === 'serve' && this.token === token && this.server) { this.report(); return; }
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
          if (msg?.hello === this.token && this.token && msg?.probe) { socket.write(JSON.stringify({ welcome: true }) + '\n'); setTimeout(() => socket.destroy(), 200); }
          else if (msg?.hello === this.token && this.token) { admitted = true; this.peers.add(socket); socket.write(JSON.stringify({ welcome: true }) + '\n'); this.report(); }
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
    if (this.mode === 'join' && this.host === host && this.token === token) { this.report(); return; }
    this.stop();
    this.mode = 'join';
    this.host = host;
    this.token = token;
    this.connect();
  }

  private connect() {
    if (this.mode !== 'join' || !this.host) return;
    const host = this.host;
    const socket = TcpSocket.createConnection({ port: HUB_PORT, host }, () => {
      socket.write(JSON.stringify({ hello: this.token }) + '\n');
    });
    this.client = socket;
    const unanswered = setTimeout(() => { if (this.client === socket && !this.clientReady) socket.destroy(); }, WELCOME_MS);
    const read = lineReader((line) => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg?.welcome) { clearTimeout(unanswered); this.clientReady = true; this.failures.delete(host); this.report(); return; }
      if (msg?.message !== undefined) this.emit({ kind: 'message', message: msg.message });
    }, () => socket.destroy());
    socket.on('data', read);
    const lost = () => {
      clearTimeout(unanswered);
      if (this.client !== socket) return;
      if (!this.clientReady) {
        const n = (this.failures.get(host) ?? 0) + 1;
        this.failures.set(host, n);
        if (n >= FAILS_BEFORE_SEARCH) void this.search(host, this.token);
      }
      this.client = null;
      this.clientReady = false;
      this.report();
      if (this.mode === 'join') this.retry = setTimeout(() => this.connect(), RECONNECT_MS);
    };
    socket.on('close', lost);
    socket.on('error', lost);
    this.report();
  }

  /**
   * The hub is not at its saved address — the router gave its tablet another one (2026-11-02: with no internet the
   * screens could not be told). Every address on this tablet's network (the usual home/salon x.x.x.1–254) is tried
   * on the hub port; only the hub answers with a welcome for the salon's token, so nothing else is mistaken for it.
   * Found: the screen saves the new address and connects to it.
   */
  private async search(failedHost: string, token: string): Promise<void> {
    if (this.searching || !token || Date.now() - this.lastSearchAt < SEARCH_AGAIN_MS) return;
    const own = await this.localAddress();
    const m = own ? /^(\d+\.\d+\.\d+)\.(\d+)$/.exec(own) : null;
    if (!m) return;
    this.searching = true;
    this.lastSearchAt = Date.now();
    try {
      const candidates: string[] = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${m[1]}.${i}`;
        if (ip !== own && ip !== failedHost) candidates.push(ip);
      }
      console.log(`[local-hub] hub not at ${failedHost}: searching ${m[1]}.x`);
      for (let at = 0; at < candidates.length; at += SEARCH_BATCH) {
        const batch = candidates.slice(at, at + SEARCH_BATCH);
        const answers = await Promise.all(batch.map((ip) => this.probe(ip, token).then((ok) => (ok ? ip : null))));
        const found = answers.find((ip): ip is string => ip != null);
        if (found) {
          console.log(`[local-hub] hub found at ${found}`);
          this.failures.delete(failedHost);
          this.emit({ kind: 'found', address: found });
          // Still trying the old address: move over now (the screen saves it and will ask for the same).
          if (this.mode === 'join' && this.host === failedHost && this.token === token) this.join(found, token);
          return;
        }
      }
      console.log('[local-hub] hub not found on this network');
    } finally {
      this.searching = false;
    }
  }

  /** True when the salon's hub answers at this address. */
  private probe(host: string, token: string): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      let socket: Socket | null = null;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { socket?.destroy(); } catch { /* already closed */ }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), PROBE_MS);
      try {
        socket = TcpSocket.createConnection({ port: HUB_PORT, host, connectTimeout: PROBE_MS }, () => {
          socket?.write(JSON.stringify({ hello: token, probe: true }) + '\n');
        });
        socket.on('data', lineReader((line) => {
          try { if (JSON.parse(line)?.welcome) finish(true); } catch { /* not the hub */ }
        }, () => finish(false)));
        socket.on('error', () => finish(false));
        socket.on('close', () => finish(false));
      } catch {
        finish(false);
      }
    });
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
