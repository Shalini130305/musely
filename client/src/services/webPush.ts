import api, { getErrorMessage } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPushNotifications(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  requiresPWA?: boolean;
}> {
  if (!isPushSupported()) {
    if (isIOS() && !isStandalone()) {
      return {
        success: false,
        requiresPWA: true,
        error: 'On iPhone/iPad, Web Push requires installing MUSELY to your Home Screen first (tap Share → "Add to Home Screen").',
      };
    }
    return {
      success: false,
      error: 'Web Push notifications are not supported in your current browser.',
    };
  }

  try {
    // 1. Request browser notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: permission === 'denied'
          ? 'Notification permission was blocked in browser settings. Please enable notifications for MUSELY to receive updates.'
          : 'Notification permission was dismissed.',
      };
    }

    // 2. Fetch VAPID public key from backend
    const { data: keyData } = await api.get('/notifications/push/vapid-public-key');
    if (!keyData?.publicKey) {
      return {
        success: false,
        error: 'Push service is currently unavailable. Please try again later.',
      };
    }

    // 3. Register service worker and subscribe
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    // 4. Send subscription to backend
    const rawSub = subscription.toJSON();
    await api.post('/notifications/push/subscribe', {
      endpoint: rawSub.endpoint,
      keys: rawSub.keys,
      userAgent: navigator.userAgent,
    });

    return {
      success: true,
      message: 'Mobile push notifications enabled successfully!',
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isPushSupported()) {
    return { success: true };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      try {
        await api.post('/notifications/push/unsubscribe', {
          endpoint: subscription.endpoint,
        });
      } catch {
        // quiet backend cleanup failure
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}

export async function sendTestPush(): Promise<{
  success: boolean;
  sent?: number;
  message?: string;
  error?: string;
}> {
  try {
    const { data } = await api.post('/notifications/push/test');
    return { success: true, sent: data.sent ?? 1, message: data.message };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
}
