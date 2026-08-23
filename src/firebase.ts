import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, setPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

const isNonEmpty = (value: string | undefined) => Boolean(value && value.trim().length > 0);

const requiredConfig = {
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
};

export const isFirebaseConfigured = Object.values(requiredConfig).every(isNonEmpty);

if (!isFirebaseConfigured) {
  console.warn(
    "[Twinly] Firebase config is missing. Set VITE_FIREBASE_* environment variables to enable Google login."
  );
}

const app: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;
export const webPushPublicKey =
  (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined) ||
  "BKEpEJv5umbr7E9b5dptGP0YgCV8EdVo13tDzYxUHrue90qhqIddPtzGjxv5eFuRnQgghz_G_9yOCZQV3QS8SQI";

export async function ensureAuthPersistence() {
  if (!auth) return;
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch (error) {
    console.warn("[Twinly] IndexedDB persistence unavailable, falling back to localStorage.", error);
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (fallbackError) {
      console.warn("[Twinly] Auth persistence setup failed.", fallbackError);
    }
  }
}

export async function initAnalytics() {
  if (!app || import.meta.env.DEV) return null;
  const ok = await isSupported();
  return ok ? getAnalytics(app) : null;
}
