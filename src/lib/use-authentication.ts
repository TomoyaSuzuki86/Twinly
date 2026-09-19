import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, ensureAuthPersistence, isFirebaseConfigured } from "@/firebase";

declare global {
  interface Window {
    TwinlyAndroid?: {
      saveWearToken?: (token: string) => void;
      signInWithGoogle?: () => void;
    };
  }
}

const EMAIL_FOR_SIGN_IN_KEY = "twinly-email-for-sign-in";

export type AuthUser = User;
export type AuthChangeContext = { isCurrent: () => boolean };

type Options = {
  inviteToken: string;
  onUserChanged: (user: User | null, context: AuthChangeContext) => void | Promise<void>;
};

export function useAuthentication({ inviteToken, onUserChanged }: Options) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const callbackRef = useRef(onUserChanged);
  const inviteTokenRef = useRef(inviteToken);
  callbackRef.current = onUserChanged;
  inviteTokenRef.current = inviteToken;

  const enabled = isFirebaseConfigured && Boolean(auth);

  useEffect(() => {
    if (!auth) {
      setReady(true);
      return;
    }

    const currentAuth = auth;
    let unsubscribe = () => {};
    let cancelled = false;
    let generation = 0;

    const initialize = async () => {
      await ensureAuthPersistence();
      if (cancelled) return;

      if (isSignInWithEmailLink(currentAuth, window.location.href)) {
        const email =
          window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY) ||
          window.prompt("ログイン用メールアドレスを入力してください");
        if (email) {
          try {
            await signInWithEmailLink(currentAuth, email, window.location.href);
            window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
            window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
          } catch (error) {
            console.error("Email link sign-in failed", error);
            alert("メールリンクでログインできませんでした。もう一度メールを送信してください。");
          }
        }
      }

      if (cancelled) return;
      unsubscribe = onAuthStateChanged(currentAuth, (nextUser) => {
        const currentGeneration = ++generation;
        setUser(nextUser);
        // Auth readiness only means Firebase has resolved the signed-in user.
        // Family/session refresh is deliberately background work so it cannot freeze the UI.
        setReady(true);
        const context: AuthChangeContext = {
          isCurrent: () => !cancelled && currentGeneration === generation,
        };
        void Promise.resolve(callbackRef.current(nextUser, context)).catch((error) => {
          if (context.isCurrent()) console.error("Auth state follow-up failed", error);
        });
      });
    };

    void initialize();

    return () => {
      cancelled = true;
      generation += 1;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleAndroidGoogleToken = async (event: Event) => {
      if (!auth) return;
      const idToken = (event as CustomEvent<{ idToken?: string }>).detail?.idToken;
      if (!idToken) return;
      try {
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      } catch (error) {
        console.error(error);
        alert("Googleログインに失敗しました");
      }
    };

    window.addEventListener("twinlyAndroidGoogleIdToken", handleAndroidGoogleToken);
    return () => window.removeEventListener("twinlyAndroidGoogleIdToken", handleAndroidGoogleToken);
  }, []);

  const signInGoogle = async () => {
    if (!auth) return;
    if (window.TwinlyAndroid?.signInWithGoogle) {
      window.TwinlyAndroid.signInWithGoogle();
      return;
    }
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error(error);
      alert("サインインに失敗しました");
    }
  };

  const sendEmailLink = async (email: string) => {
    if (!auth) return;
    const continueUrl = new URL(window.location.origin);
    if (inviteTokenRef.current) continueUrl.searchParams.set("invite", inviteTokenRef.current);
    await sendSignInLinkToEmail(auth, email, {
      url: continueUrl.toString(),
      handleCodeInApp: true,
    });
    window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
  };

  const signOutUser = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  return { user, ready, enabled, signInGoogle, sendEmailLink, signOutUser };
}
