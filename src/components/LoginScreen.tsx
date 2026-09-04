import { FormEvent, useState } from "react";
import { Baby, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginScreenProps = {
  onSendEmailLink: (email: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void> | void;
};

export function LoginScreen({ onSendEmailLink, onGoogleSignIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSendEmailLink(email.trim());
      setSent(true);
    } catch (caught) {
      console.error(caught);
      setError("メールを送信できませんでした。入力内容を確認してもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6 text-card-foreground shadow-xl sm:p-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
            <Baby className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">Twinly</h1>
            <p className="mt-1 text-sm text-muted-foreground">家族で育児記録を共有できます</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <Mail className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
              <p className="font-semibold">ログインメールを送信しました</p>
              <p className="mt-1 break-all text-sm text-muted-foreground">{email}</p>
            </div>
            <p className="text-sm text-muted-foreground">メール内のリンクを開くとログインできます。</p>
            <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
              メールアドレスを変更
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="login-email">メールアドレス</Label>
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "送信中…" : "メールでログイン"}
            </Button>
          </form>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          または
          <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={() => void onGoogleSignIn()} disabled={busy}>
          Googleでログイン
        </Button>
        <p className="text-center text-xs text-muted-foreground">パスワードをTwinlyで保存することはありません。</p>
      </div>
    </div>
  );
}
