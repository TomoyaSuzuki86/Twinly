import { useEffect, useRef, useState } from "react";
import type { BabyId, LogEvent } from "@/types";

type AddEvent = (
  event: Omit<LogEvent, "id" | "timestamp" | "createdByUid" | "updatedByUid" | "createdAt" | "updatedAt">
) => boolean | void;

export function useBabyHealthInputs({
  babyId,
  lastWeight,
  lastHeight,
  onAddEvent,
}: {
  babyId: BabyId;
  lastWeight: number | null;
  lastHeight: number | null;
  onAddEvent: AddEvent;
}) {
  const [temperature, setTemperature] = useState("36.0");
  const [weight, setWeightState] = useState("");
  const [height, setHeightState] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const weightDirty = useRef(false);
  const heightDirty = useRef(false);

  useEffect(() => {
    weightDirty.current = false;
    heightDirty.current = false;
    setWeightState(lastWeight ? lastWeight.toFixed(2) : "");
    setHeightState(lastHeight ? lastHeight.toFixed(1) : "");
  }, [babyId]);

  useEffect(() => {
    if (!weightDirty.current) setWeightState(lastWeight ? lastWeight.toFixed(2) : "");
  }, [lastWeight]);

  useEffect(() => {
    if (!heightDirty.current) setHeightState(lastHeight ? lastHeight.toFixed(1) : "");
  }, [lastHeight]);

  const setWeight = (value: string) => {
    weightDirty.current = true;
    setWeightState(value);
  };

  const setHeight = (value: string) => {
    heightDirty.current = true;
    setHeightState(value);
  };

  const saveHealthRecord = (type: "temperature" | "weight" | "height") => {
    if (type === "temperature" && temperature) {
      onAddEvent({ babyId, type: "temperature", temperature: parseFloat(temperature) });
      setTemperature("36.0");
      return;
    }

    if (type === "weight" && weight) {
      onAddEvent({ babyId, type: "weight", weight: parseFloat(weight) });
      weightDirty.current = false;
      return;
    }

    if (type === "height" && height) {
      onAddEvent({ babyId, type: "height", height: parseFloat(height) });
      heightDirty.current = false;
    }
  };

  const saveDailyNote = () => {
    const note = dailyNote.trim();
    if (!note) return;
    onAddEvent({ babyId, type: "daily", note });
    setDailyNote("");
  };

  return {
    temperature,
    setTemperature,
    weight,
    setWeight,
    height,
    setHeight,
    dailyNote,
    setDailyNote,
    saveHealthRecord,
    saveDailyNote,
  };
}
