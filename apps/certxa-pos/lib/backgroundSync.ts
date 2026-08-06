import { Platform } from 'react-native';
import { syncQueue } from './offlineQueue';

const SYNC_TASK = 'certxa-offline-sync';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TaskManager: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let BackgroundFetch: any = null;

function loadModules(): boolean {
  if (TaskManager) return true;
  try {
    TaskManager = require('expo-task-manager');
    BackgroundFetch = require('expo-background-fetch');
    return true;
  } catch {
    return false;
  }
}

export function defineBackgroundSyncTask(): void {
  if (Platform.OS === 'web') return;
  if (!loadModules()) return;
  if (TaskManager.isTaskDefined(SYNC_TASK)) return;

  TaskManager.defineTask(SYNC_TASK, async () => {
    try {
      const { synced } = await syncQueue(
        async () => { /* API call handled inside offlineQueue */ },
      );
      return synced > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerBackgroundSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!loadModules()) return;

  try {
    await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Already registered or not supported in Expo Go — safe to ignore
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  if (!loadModules()) return;
  try {
    await BackgroundFetch.unregisterTaskAsync(SYNC_TASK);
  } catch {}
}
