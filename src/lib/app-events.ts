export const TWINLY_WINDOW_EVENTS = {
  aiAdviceOpen: "twinly-ai-advice-open",
  androidGoogleIdToken: "twinlyAndroidGoogleIdToken",
} as const;

export type AndroidGoogleIdTokenDetail = { idToken?: string };

export const dispatchAiAdviceOpen = () => {
  window.dispatchEvent(new Event(TWINLY_WINDOW_EVENTS.aiAdviceOpen));
};
