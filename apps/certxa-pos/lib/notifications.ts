import { Platform } from 'react-native';

const SUPPORTED = Platform.OS !== 'web';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;

async function getNotifications() {
  if (!SUPPORTED) return null;
  if (Notifications) return Notifications;
  try {
    // Dynamic import keeps the module optional — graceful no-op when not installed or in Expo Go
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
    if (Notifications?.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
    return Notifications;
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  const N = await getNotifications();
  if (!N) return null;

  try {
    const Device = await import('expo-device');
    if (!Device.isDevice) return null;

    const { status: existingStatus } = await N.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const token = await N.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

export async function scheduleAppointmentReminder(opts: {
  id: number;
  clientName: string;
  serviceName: string;
  startTime: string;
  minutesBefore?: number;
}): Promise<string | null> {
  const N = await getNotifications();
  if (!N) return null;

  const { minutesBefore = 30 } = opts;
  const apptTime = new Date(opts.startTime).getTime();
  const triggerTime = apptTime - minutesBefore * 60 * 1000;

  if (triggerTime <= Date.now()) return null;

  try {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: `Upcoming: ${opts.clientName}`,
        body: `${opts.serviceName} in ${minutesBefore} minutes`,
        data: { appointmentId: opts.id },
      },
      trigger: { date: new Date(triggerTime) },
    });
    return id as string;
  } catch {
    return null;
  }
}

export async function cancelAppointmentReminder(notificationId: string): Promise<void> {
  const N = await getNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(notificationId);
  } catch { /* ignore */ }
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  const N = await getNotifications();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({
      content: { title, body, data: data ?? {} },
      trigger: null,
    });
  } catch { /* ignore */ }
}

export async function sendPaymentConfirmationNotification(opts: {
  clientName: string;
  total: string;
  method: string;
}): Promise<void> {
  const methodLabel =
    opts.method === 'tap_to_pay' ? 'Tap to Pay' :
    opts.method === 'terminal'   ? 'Card Reader' :
    opts.method === 'manual'     ? 'Card (Manual)' : 'Cash';
  await sendLocalNotification(
    'Payment Complete',
    `$${opts.total} collected from ${opts.clientName} via ${methodLabel}`,
  );
}
