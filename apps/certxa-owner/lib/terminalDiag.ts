/**
 * terminalDiag.ts
 *
 * Module-level diagnostic event store for the Stripe Terminal lifecycle.
 * Written by _layout.tsx at each key milestone; read by the diagnostics screen.
 * Stored outside React so it survives component unmounts and is always current.
 */

export interface DiagEvent {
  occurred: boolean;
  at: number | null;   // Date.now() when the event fired
  error: string | null;
}

function makeEvent(): DiagEvent {
  return { occurred: false, at: null, error: null };
}

interface DiagStore {
  providerMounted: DiagEvent;
  tokenRequested:  DiagEvent;
  tokenReceived:   DiagEvent;
  sdkInitialized:  DiagEvent;

  // React-style subscription so the diagnostics screen can re-render on changes.
  _listeners: Set<() => void>;
  subscribe(fn: () => void): () => void;
  _notify(): void;

  markProviderMounted(): void;
  markTokenRequested():  void;
  markTokenReceived():   void;
  markSdkInitialized():  void;
  markInitFailed(msg: string):  void;
  markTokenFailed(msg: string): void;
  reset(): void;
}

export const terminalDiag: DiagStore = {
  providerMounted: makeEvent(),
  tokenRequested:  makeEvent(),
  tokenReceived:   makeEvent(),
  sdkInitialized:  makeEvent(),

  _listeners: new Set(),

  subscribe(fn) {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  },

  _notify() {
    this._listeners.forEach(fn => fn());
  },

  markProviderMounted() {
    this.providerMounted = { occurred: true, at: Date.now(), error: null };
    this._notify();
  },
  markTokenRequested() {
    this.tokenRequested = { occurred: true, at: Date.now(), error: null };
    this._notify();
  },
  markTokenReceived() {
    this.tokenReceived = { occurred: true, at: Date.now(), error: null };
    this._notify();
  },
  markSdkInitialized() {
    this.sdkInitialized = { occurred: true, at: Date.now(), error: null };
    this._notify();
  },
  markInitFailed(msg) {
    this.sdkInitialized = { occurred: false, at: Date.now(), error: msg };
    this._notify();
  },
  markTokenFailed(msg) {
    this.tokenReceived = { occurred: false, at: Date.now(), error: msg };
    this._notify();
  },

  reset() {
    this.providerMounted = makeEvent();
    this.tokenRequested  = makeEvent();
    this.tokenReceived   = makeEvent();
    this.sdkInitialized  = makeEvent();
    this._notify();
  },
};
