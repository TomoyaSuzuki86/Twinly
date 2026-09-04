import { FormEvent, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { familyRelationshipOptions, normalizeNickname } from "@/lib/family";
import { FamilyRelationship } from "@/types";

type ProfileSetupProps = {
  defaultNickname: string;
  joiningFamily: boolean;
  onSubmit: (profile: { nickname: string; relationship: FamilyRelationship }) => Promise<void>;
  onSignOut: () => Promise<void> | void;
};

export function ProfileSetup({ defaultNickname, joiningFamily, onSubmit, onSignOut }: ProfileSetupProps) {
  const [nickname, setNickname] = useState(defaultNickname.slice(0, 20));
  const [relationship, setRelationship] = useState<FamilyRelationship | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedNickname = normalizeNickname(nickname);
    if (!normalizedNickname || !relationship) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ nickname: normalizedNickname, relationship });
    } catch (caught) {
      console.error(caught);
      setError(
        joiningFamily
          ? "家族に参加できませんでした。招待リンクの期限が切れている可能性があります。"
          : "プロフィールを登録できませんでした。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="space-y-2 text-center">
          <UserRoundPlus className="mx-auto h-9 w-9 text-violet-400" />
          <h1 className="text-xl font-bold">プロフィール登録</h1>
          <p className="text-sm text-muted-foreground">
            {joiningFamily ? "ニックネームを登録して家族に参加します。" : "家族に表示する名前を登録します。"}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-nickname">ニックネーム</Label>
          <Input
            id="profile-nickname"
            value={nickname}
            maxLength={20}
            autoComplete="nickname"
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例：とも"
            required
          />
          <p className="text-right text-xs text-muted-foreground">{nickname.length}/20</p>
        </div>
        <div className="space-y-2">
          <Label>続柄</Label>
          <Select value={relationship} onValueChange={(value) => setRelationship(value as FamilyRelationship)}>
            <SelectTrigger aria-label="続柄">
              <SelectValue placeholder="続柄を選択" />
            </SelectTrigger>
            <SelectContent>
              {familyRelationshipOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={busy || !normalizeNickname(nickname) || !relationship}>
          {busy ? "登録中…" : joiningFamily ? "家族に参加する" : "Twinlyをはじめる"}
        </Button>
        <Button className="w-full" type="button" variant="ghost" onClick={() => void onSignOut()} disabled={busy}>
          別のアカウントでログイン
        </Button>
      </form>
    </div>
  );
}
