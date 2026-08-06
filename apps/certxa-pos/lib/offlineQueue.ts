import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'certxa:offline_payment_queue';

export type QueuedPayment = {
  id: string;
  storeId: number;
  amount: number;
  tipAmount: number;
  clientId: number | null;
  clientName: string;
  appointmentId: number | null;
  method: 'tap_to_pay' | 'terminal' | 'manual' | 'cash';
  queuedAt: string;
  retries: number;
};

export async function enqueuePayment(payment: Omit<QueuedPayment, 'id' | 'queuedAt' | 'retries'>): Promise<void> {
  const queue = await getQueue();
  const item: QueuedPayment = {
    ...payment,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    queuedAt: new Date().toISOString(),
    retries: 0,
  };
  queue.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<QueuedPayment[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedPayment[];
  } catch {
    return [];
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((p) => p.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function incrementRetries(id: string): Promise<void> {
  const queue = await getQueue();
  const updated = queue.map((p) => p.id === id ? { ...p, retries: p.retries + 1 } : p);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
}

export async function syncQueue(
  syncFn: (payment: QueuedPayment) => Promise<void>,
  onSuccess?: (id: string) => void,
  onError?: (id: string, err: Error) => void,
): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const payment of queue) {
    if (payment.retries >= 5) {
      failed++;
      continue;
    }
    try {
      await syncFn(payment);
      await removeFromQueue(payment.id);
      synced++;
      onSuccess?.(payment.id);
    } catch (err) {
      await incrementRetries(payment.id);
      failed++;
      onError?.(payment.id, err instanceof Error ? err : new Error(String(err)));
    }
  }

  return { synced, failed };
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
