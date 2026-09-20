import type { BabyId, BabyProfile } from "@/types";
import { iconGradients } from "@/lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { BABY_DISPLAY_ORDER } from "@/lib/settings-gauge-policy";

type ProfileChange = <K extends keyof BabyProfile>(
  babyId: BabyId,
  field: K,
  value: BabyProfile[K]
) => void;

export function SettingsProfileTab({
  profiles,
  diaperStockManagementEnabled,
  onProfileChange,
}: {
  profiles: Record<BabyId, BabyProfile>;
  diaperStockManagementEnabled: boolean;
  onProfileChange: ProfileChange;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {BABY_DISPLAY_ORDER.map((babyId) => {
        const profile = profiles[babyId];
        const babyDimmedBgColor =
          iconGradients.find((gradient) => gradient.value === profile.iconGradient)?.dimmedBgColor ??
          "bg-background";

        return (
          <div
            key={babyId}
            data-testid={`profile-settings-${babyId}`}
            className={`space-y-4 rounded-lg border border-border/60 p-4 ${babyDimmedBgColor}`}
          >
            <h3 className="font-semibold">赤ちゃん {babyId}</h3>
            <div className="space-y-2">
              <Label>表示名</Label>
              <Input
                value={profile.displayName}
                onChange={(event) => onProfileChange(babyId, "displayName", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>アイコン絵文字</Label>
              <Input
                maxLength={2}
                value={profile.iconEmoji ?? ""}
                onChange={(event) => onProfileChange(babyId, "iconEmoji", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>アイコンカラー</Label>
              <Select
                value={profile.iconGradient ?? ""}
                onValueChange={(value) => onProfileChange(babyId, "iconGradient", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="アイコンカラーを選択" />
                </SelectTrigger>
                <SelectContent>
                  {iconGradients.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <span className={`h-4 w-4 rounded-full ${option.bgColor}`} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>生年月日</Label>
              <Input
                type="date"
                value={profile.birthDate}
                onChange={(event) => onProfileChange(babyId, "birthDate", event.target.value)}
              />
            </div>
            {diaperStockManagementEnabled ? (
              <div className="space-y-2">
                <Label>おむつ購入リンク</Label>
                <Input
                  value={profile.diaperPurchaseUrl ?? ""}
                  onChange={(event) => onProfileChange(babyId, "diaperPurchaseUrl", event.target.value)}
                  placeholder="https://..."
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
