import { BabyProfile } from "@/types";
import { daysSince } from "@/lib/utils";
import { Baby } from "lucide-react";

type BabyTabTriggerProps = {
  profile: BabyProfile;
};

export function BabyTabTrigger({ profile }: BabyTabTriggerProps) {
  const p = profile;
  const ageDays = daysSince(p.birthDate);

  return (
    <div className="flex items-center gap-3 p-2">
      <div
        className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${
          p.iconGradient ?? "from-violet-500 to-fuchsia-500"
        }`}
      >
        {p.iconEmoji ? (
          <span className="text-3xl">{p.iconEmoji}</span>
        ) : (
          <Baby className="h-7 w-7 text-white" />
        )}
      </div>
      <div className="text-left">
        <p className="font-semibold leading-none tracking-tight">{p.displayName}</p>
        <p className="mt-1 text-sm text-muted-foreground">生後{ageDays}日</p>
      </div>
    </div>
  );
}
