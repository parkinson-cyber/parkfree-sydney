/**
 * Local notifications for the premium parking timer.
 * Schedules a "move your car" alert 10 minutes before expiry (or at expiry
 * for short stays). No-ops gracefully on web.
 */

import { Platform } from 'react-native';

let Notifications: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Returns the scheduled notification id (undefined on web / denied). */
export async function scheduleExpiryAlert(
  expiresAt: number,
  streetName?: string,
): Promise<string | undefined> {
  if (!Notifications) return undefined;
  const ok = await ensureNotificationPermission();
  if (!ok) return undefined;

  const minutesLeft = (expiresAt - Date.now()) / 60000;
  const warnMin = minutesLeft > 15 ? 10 : 0; // warn 10 min early when possible
  const fireAt = new Date(expiresAt - warnMin * 60000);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: warnMin ? '🚗 Parking expires in 10 minutes' : '🚗 Parking expired',
      body: streetName
        ? `Time to move your car on ${streetName}.`
        : 'Time to move your car.',
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
}

export async function cancelAlert(id?: string): Promise<void> {
  if (!Notifications || !id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or cancelled
  }
}
