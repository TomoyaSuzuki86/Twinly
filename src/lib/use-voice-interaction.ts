import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { BabyId } from "@/types";
import type { VoiceCommandButtonHandle } from "@/components/VoiceCommandButton";

export const useVoiceInteraction = (
  setSelectedBabyTab: Dispatch<SetStateAction<BabyId>>
) => {
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const voiceButtonRef = useRef<VoiceCommandButtonHandle | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceLongPressTimerRef = useRef<number | null>(null);

  const showVoiceMessage = (message: string) => {
    if (voiceTimerRef.current !== null) {
      window.clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    setVoiceMessage(message);
    voiceTimerRef.current = window.setTimeout(() => setVoiceMessage(null), 4500);
  };

  const startVoiceInput = () => {
    voiceButtonRef.current?.startListening();
  };

  const startVoiceInputForBabyTab = (babyId: BabyId) => {
    setSelectedBabyTab(babyId);
    window.setTimeout(() => voiceButtonRef.current?.startListening(babyId), 0);
  };

  const clearVoiceLongPress = () => {
    if (voiceLongPressTimerRef.current === null) return;
    window.clearTimeout(voiceLongPressTimerRef.current);
    voiceLongPressTimerRef.current = null;
  };

  const beginVoiceLongPress = (babyId?: BabyId) => {
    clearVoiceLongPress();
    voiceLongPressTimerRef.current = window.setTimeout(() => {
      voiceLongPressTimerRef.current = null;
      if (babyId) startVoiceInputForBabyTab(babyId);
      else startVoiceInput();
    }, 550);
  };

  useEffect(
    () => () => {
      if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
      if (voiceLongPressTimerRef.current !== null) window.clearTimeout(voiceLongPressTimerRef.current);
    },
    []
  );

  return {
    voiceMessage,
    voiceButtonRef,
    showVoiceMessage,
    startVoiceInput,
    startVoiceInputForBabyTab,
    beginVoiceLongPress,
    clearVoiceLongPress,
  };
};
