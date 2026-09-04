import { useEffect, useState } from "react";
import { Check, Copy, Crown, LogOut, UserRound, UsersRound } from "lucide-react";
import type { User } from "firebase/auth";
import * as DialogComponents from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { familyRelationshipOptions, normalizeNickname, relationshipLabels } from "@/lib/family";
import { FamilyInfo, FamilyMember, FamilyRelationship } from "@/types";

type AccountModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  family: FamilyInfo;
  member: FamilyMember;
  members: FamilyMember[];
  onSaveProfile: (profile: { nickname: string; relationship: FamilyRelationship }) => Promise<void>;
  onCreateInvite: () => Promise<string>;
  onSignOut: () => Promise<void> | void;
};

const initials = (nickname: string) => nickname.trim().slice(0, 1) || "?";

export function AccountModal({
  open,
  onOpenChange,
  user,
  family,
  member,
  members,
  onSaveProfile,
  onCreateInvite,
  onSignOut,
}: AccountModalProps) {
  const [nickname, setNickname] = useState(member.nickname);
  const [relationship, setRelationship] = useState<FamilyRelationship>(member.relationship);
  const [profileBusy, setProfileBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setNickname(member.nickname);
    setRelationship(member.relationship);
    setInviteLink("");
    setCopied(false);
    setMessage("");
  }, [open, member.nickname, member.relationship]);

  const saveProfile = async () => {
    const normalized = normalizeNickname(nickname);
    if (!normalized) return;
    setProfileBusy(true);
    setMessage("");
    try {
      await onSaveProfile({ nickname: normalized, relationship });
      setNickname(normalized);
      setMessage("プロフィールを保存しました");
    } catch (error) {
      console.error(error);
      setMessage("プロフィールを保存できませんでした");
    } finally {
      setProfileBusy(false);
    }
  };

  const createInvite = async () => {
    setInviteBusy(true);
    setMessage("");
    try {
      const link = await onCreateInvite();
      setInviteLink(link);
      setCopied(false);
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {
        // The visible input remains available when clipboard permission is unavailable.
      }
    } catch (error) {
      console.error(error);
      setMessage("招待リンクを作成できませんでした");
    } finally {
      setInviteBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  };

  return (
    <DialogComponents.Dialog open={open} onOpenChange={onOpenChange}>
      <DialogComponents.DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-md">
        <DialogComponents.DialogHeader>
          <DialogComponents.DialogTitle>アカウント</DialogComponents.DialogTitle>
          <DialogComponents.DialogDescription>プロフィールと家族メンバーを管理します。</DialogComponents.DialogDescription>
        </DialogComponents.DialogHeader>

        <div className="space-y-5 py-3">
          <section className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5" />自分のプロフィール</div>
            <div className="space-y-2">
              <Label htmlFor="account-nickname">ニックネーム</Label>
              <Input id="account-nickname" value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>続柄</Label>
              <Select value={relationship} onValueChange={(value) => setRelationship(value as FamilyRelationship)}>
                <SelectTrigger aria-label="続柄"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {familyRelationshipOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={saveProfile} disabled={profileBusy || !normalizeNickname(nickname)}>
              {profileBusy ? "保存中…" : "プロフィールを保存"}
            </Button>
          </section>

          <section className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold"><UsersRound className="h-5 w-5" />家族メンバー</div>
                <p className="mt-1 text-xs text-muted-foreground">{family.name}・{members.length}人</p>
              </div>
              {member.role === "owner" ? (
                <Button size="sm" variant="outline" onClick={createInvite} disabled={inviteBusy}>
                  {inviteBusy ? "作成中…" : "家族を招待"}
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              {members.map((familyMember) => (
                <div key={familyMember.uid} className="flex items-center gap-3 rounded-lg bg-muted/45 p-3">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-violet-500/20 font-bold text-violet-200">
                    {initials(familyMember.nickname)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {familyMember.nickname}{familyMember.uid === member.uid ? "（自分）" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{relationshipLabels[familyMember.relationship]}</p>
                  </div>
                  {familyMember.role === "owner" ? (
                    <span className="flex items-center gap-1 text-xs text-amber-300"><Crown className="h-3.5 w-3.5" />管理者</span>
                  ) : null}
                </div>
              ))}
            </div>
            {inviteLink ? (
              <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                <p className="text-sm font-semibold">招待リンク（24時間・1回限り）</p>
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} />
                  <Button size="icon" variant="outline" aria-label="招待リンクをコピー" onClick={copyInvite}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                {copied ? <p className="text-xs text-emerald-400">コピーしました</p> : null}
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-xl border p-4">
            <p className="font-semibold">ログイン</p>
            <p className="break-all text-sm text-muted-foreground">{user.email || "Googleアカウント"}</p>
            <Button variant="outline" className="w-full" onClick={() => void onSignOut()}>
              <LogOut className="mr-2 h-4 w-4" />ログアウト
            </Button>
          </section>
          {message ? <p className="text-center text-sm" role="status">{message}</p> : null}
        </div>

        <DialogComponents.DialogFooter>
          <DialogComponents.DialogClose asChild><Button variant="outline">閉じる</Button></DialogComponents.DialogClose>
        </DialogComponents.DialogFooter>
      </DialogComponents.DialogContent>
    </DialogComponents.Dialog>
  );
}
