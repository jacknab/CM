export type ReconciliationStatus = "idle" | "reconciling" | "done";

const RECONCILIATION_TIMEOUT_MS = 30_000;
const RECONCILIATION_MIN_MS = 2_000;

type Listener = (status: ReconciliationStatus) => void;

class ReconciliationManager {
  private status: ReconciliationStatus = "idle";
  private listeners = new Set<Listener>();
  private isRunning = false;

  getStatus(): ReconciliationStatus {
    return this.status;
  }

  isReconciling(): boolean {
    return this.status === "reconciling";
  }

  onStatusChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(s: ReconciliationStatus) {
    if (this.status === s) return;
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  async begin(jobs: Array<() => Promise<void>>): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit("reconciling");

    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, RECONCILIATION_TIMEOUT_MS)
    );

    const minDelay = new Promise<void>((resolve) =>
      setTimeout(resolve, RECONCILIATION_MIN_MS)
    );

    const work = async () => {
      for (const job of jobs) {
        try {
          await job();
        } catch {
        }
      }
    };

    await Promise.all([Promise.race([work(), timeout]), minDelay]);

    this.isRunning = false;
    this.emit("done");
    setTimeout(() => this.emit("idle"), 600);
  }
}

export const reconciliationManager = new ReconciliationManager();
