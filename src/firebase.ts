import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const isNonEmpty = (value: string | undefined) => Boolean(value && value.trim().length > 0);

export const isFirebaseConfigured = Object.values(firebaseConfig).every(isNonEmpty);

if (!isFirebaseConfigured) {
  console.warn(
    "[Twinly] Firebase config is missing. Set VITE_FIREBASE_* in .env.local to enable Google login."
  );
}

const app: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
