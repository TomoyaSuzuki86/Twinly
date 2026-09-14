import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, webPushPublicKey } from "@/firebase";
import {
  getDeviceId,
  getExistingPushSubscription,
  getNotificationPermission,
  isWebPushSupported,
  requestNotificationPermission,
  serializePushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "./web-push";

export function usePushNotifications(user: User | null) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    getNotificationPermission()
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const syncCurrentSubscription = async () => {
    if (!db || !user || !isWebPushSupported()) return false;
    const subscription = await getExistingPushSubscription();
    if (!subscription || Notification.permission !== "granted") return false;

    const deviceId = getDeviceId();
    await setDoc(
      doc(db, "users", user.uid, "devices", deviceId),
      {
        deviceId,
        platform: navigator.userAgent,
        notificationsEnabled: true,
        permission: Notification.permission,
        subscription: serializePushSubscription(subscription),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  };

  const removeCurrentDevice = async () => {
    if (!db || !user) return;
    await deleteDoc(doc(db, "users", user.uid, "devices", getDeviceId()));
  };

  useEffect(() => {
    if (!isWebPushSupported()) {
      setPermission("unsupported");
      setSubscribed(false);
      return;
    }
    setPermission(Notification.permission);
    void getExistingPushSubscription().then((subscription) => setSubscribed(Boolean(subscription)));
  }, [user]);

  useEffect(() => {
    if (!user || permission !== "granted") return;
    void syncCurrentSubscription().then((synced) => {
      if (synced) setSubscribed(true);
    });
  }, [user, permission]);

  const enable = async () => {
    if (!user || !webPushPublicKey) return;
    setBusy(true);
    try {
      const nextPermission = await requestNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setSubscribed(false);
        return;
      }
      await subscribeToPushNotifications(webPushPublicKey);
      setSubscribed(await syncCurrentSubscription());
    } catch (error) {
      console.error("Failed to enable push notifications", error);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPushNotifications();
      await removeCurrentDevice();
      setSubscribed(false);
    } catch (error) {
      console.error("Failed to disable push notifications", error);
    } finally {
      setBusy(false);
    }
  };

  return {
    permission,
    subscribed,
    busy,
    configured: Boolean(webPushPublicKey),
    enable,
    disable,
    removeCurrentDevice,
  };
}
