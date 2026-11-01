import {Platform, PermissionsAndroid} from 'react-native';

let notificationPermissionAsked: Promise<void> | undefined;

async function askNotificationPermission(): Promise<void> {
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  try {
    if (!(await PermissionsAndroid.check(permission))) {
      await PermissionsAndroid.request(permission);
    }
  } catch (error) {
    console.warn('Notification permission request failed:', error);
  }
}

/** Asks at most once per app session, so chained downloads never re-prompt. */
export function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 34) {
    return Promise.resolve();
  }
  notificationPermissionAsked ??= askNotificationPermission();
  return notificationPermissionAsked;
}
