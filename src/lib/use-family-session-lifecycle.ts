import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AppState, FamilyInfo, FamilyMember } from "@/types";
import { createInitialAppState } from "./app-state";
import { readCachedAppState } from "@/data/app-state-cache";
import {
  loadFamilySession,
  readCachedFamilySession,
  subscribeFamilyMembers,
} from "./family";
import { ensureNotificationSettingsDocument } from "./notification-settings";
import type { AuthChangeContext, AuthUser } from "./use-authentication";

type FamilySessionLifecycleOptions = {
  setApp: Dispatch<SetStateAction<AppState>>;
  setActiveDate: (date: string) => void;
  setAppLoading: (loading: boolean) => void;
  resetClock: (date: string) => void;
  onProfileIncomplete: () => void;
};

const createEmptyState = () => createInitialAppState(new Date());

export function useFamilySessionLifecycle({
  setApp,
  setActiveDate,
  setAppLoading,
  resetClock,
  onProfileIncomplete,
}: FamilySessionLifecycleOptions) {
  const [family, setFamily] = useState<FamilyInfo | null>(null);
  const [familyMember, setFamilyMember] = useState<FamilyMember | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const handleAuthUserChanged = useCallback(async (
    user: AuthUser | null,
    context: AuthChangeContext
  ) => {
    setSessionError(null);
    setCurrentUser(user);

    if (user) {
      const cachedSession = readCachedFamilySession(user.uid);
      const cachedApp = cachedSession
        ? readCachedAppState(window.localStorage, user.uid, cachedSession.family.id)
        : null;

      if (cachedSession) {
        setFamily(cachedSession.family);
        setFamilyMember(cachedSession.member);
        setFamilyMembers([cachedSession.member]);
        if (cachedApp) setApp((previous) => ({ ...cachedApp, ui: previous.ui }));
        setAppLoading(false);
      } else {
        setFamily(null);
        setFamilyMember(null);
        setFamilyMembers([]);
        setApp(createEmptyState());
        setAppLoading(true);
      }

      try {
        const session = await loadFamilySession(user);
        if (!context.isCurrent()) return;
        setFamily(session?.family ?? null);
        setFamilyMember(session?.member ?? null);
        if (session) {
          setFamilyMembers((current) => current.length ? current : [session.member]);
          if (session.member.profileCompleted === false) onProfileIncomplete();
          void ensureNotificationSettingsDocument(user).catch(console.error);
        } else {
          setFamilyMembers([]);
          setAppLoading(false);
        }
      } catch (error) {
        console.error("Failed to load family session", error);
        if (!context.isCurrent()) return;
        if (!cachedSession) {
          setSessionError("家族情報を取得できませんでした。通信状態を確認して再読み込みしてください。");
          setFamily(null);
          setFamilyMember(null);
          setFamilyMembers([]);
        }
        setAppLoading(false);
      }
      return;
    }

    const nextState = createEmptyState();
    setFamily(null);
    setFamilyMember(null);
    setFamilyMembers([]);
    setApp(nextState);
    setActiveDate(nextState.ui.lastViewedDate);
    resetClock(nextState.ui.lastViewedDate);
    setAppLoading(false);
  }, [onProfileIncomplete, resetClock, setActiveDate, setApp, setAppLoading]);

  useEffect(() => {
    if (!family || !currentUser) return;
    return subscribeFamilyMembers(
      family.id,
      (members) => {
        setFamilyMembers(members);
        const currentMember = members.find((member) => member.uid === currentUser.uid);
        if (currentMember) {
          setFamilyMember(currentMember);
        } else {
          setSessionError("家族へのアクセス権を確認できません。再読み込みしてください。");
        }
      },
      () => setSessionError("家族情報を取得できませんでした。再読み込みしてください。")
    );
  }, [currentUser, family]);

  const activateFamilySession = useCallback(async (user: AuthUser) => {
    const session = await loadFamilySession(user);
    if (!session) throw new Error("Family session was not created");
    setCurrentUser(user);
    setSessionError(null);
    setFamily(session.family);
    setFamilyMember(session.member);
    setFamilyMembers([session.member]);
    setAppLoading(true);
    await ensureNotificationSettingsDocument(user);
    return session;
  }, [setAppLoading]);

  return {
    family,
    familyMember,
    familyMembers,
    sessionError,
    setFamily,
    setFamilyMember,
    setFamilyMembers,
    setSessionError,
    handleAuthUserChanged,
    activateFamilySession,
  };
}
