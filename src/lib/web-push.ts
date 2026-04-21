const DEVICE_ID_KEY = "twinly-device-id";

export type SerializedPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

const generateDeviceId = () => {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
};

export const isWebPushSupported = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

export const getNotificationPermission = (): NotificationPermission | "unsupported" =>
  isWebPushSupported() ? Notification.permission : "unsupported";

export const getDeviceId = () => {
  const current = localStorage.getItem(DEVICE_ID_KEY);
  if (current) return current;

  const next = generateDeviceId();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
};

export const requestNotificationPermission = async () => {
  if (!isWebPushSupported()) return "unsupported" as const;
  return Notification.requestPermission();
};

export const getExistingPushSubscription = async () => {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

export const subscribeToPushNotifications = async (publicKey: string) => {
  if (!isWebPushSupported()) throw new Error("Web Push is not supported on this device.");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
};

export const unsubscribeFromPushNotifications = async () => {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
};

export const serializePushSubscription = (subscription: PushSubscription): SerializedPushSubscription => {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      auth: json.keys?.auth ?? "",
      p256dh: json.keys?.p256dh ?? "",
    },
  };
};
