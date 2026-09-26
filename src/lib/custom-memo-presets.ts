import type { CustomMemoPreset } from "@/types";

export const createCustomMemoPreset = (
  emoji: string,
  text: string,
  idFactory: () => string
): CustomMemoPreset | null => {
  const normalizedEmoji = emoji.trim();
  const normalizedText = text.trim();
  if (!normalizedEmoji || !normalizedText) return null;
  return { id: idFactory(), emoji: normalizedEmoji, text: normalizedText };
};

export const prependCustomMemoPreset = (
  presets: CustomMemoPreset[],
  preset: CustomMemoPreset
) => [preset, ...presets];

export const removeCustomMemoPreset = (
  presets: CustomMemoPreset[],
  id: string
) => presets.filter((preset) => preset.id !== id);
