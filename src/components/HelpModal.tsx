import { HelpCircle, PlayCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type HelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplayTutorial: () => void;
  names: [string, string];
};

type FaqItem = {
  question: string;
  answer: string;
};

export function HelpModal({ open, onOpenChange, onReplayTutorial, names }: HelpModalProps) {
  const faqs: FaqItem[] = [
    {
      question: "双子を切り替えるには？",
      answer: "画面上部の名前タブをタップするか、メイン画面を左右にスワイプします。横長画面の左右2人表示では、切り替えずにそれぞれの側から記録できます。",
    },
    {
      question: `${names[0]}だけに音声入力するには？`,
      answer: `${names[0]}の名前タブを長押し、またはダブルタップします。名前を言わずに「ミルク180」のように話しても、${names[0]}だけが対象になります。`,
    },
    {
      question: "2人へ同時に音声入力するには？",
      answer: "画面上部の「Twinly」を長押し、またはダブルタップします。赤ちゃんの名前を言わなければ、ミルク・おむつ・離乳食・睡眠などを2人へまとめて記録できます。",
    },
    {
      question: "音声で少し前の時刻を記録できる？",
      answer: "できます。「10分前 おしっこ」「30分前にミルク180」「8時30分におしっこ」のように、内容と時刻を一緒に話してください。",
    },
    {
      question: "音声入力で何を記録できる？",
      answer: "ミルク、離乳食、おしっこ、うんち、入眠、起床、ひとことメモ、体温、体重、身長に対応しています。",
    },
    {
      question: "音声入力が聞き取ってくれないときは？",
      answer: "マイク権限を確認し、短く区切って話すと認識しやすくなります。赤ちゃん1人だけに入れたい場合は、先にその子の名前タブから音声入力を始めるのが確実です。",
    },
    {
      question: "間違えて記録したら？",
      answer: "保存直後は画面下の「取り消す」で戻せます。あとから直す場合はログの記録をタップし、編集または削除してください。",
    },
    {
      question: "睡眠を現在時刻ではなく別の時刻で記録したい",
      answer: "睡眠ボタンを約0.5秒長押しすると時刻設定が開きます。寝かしつけ後にまとめて入力するときにも使えます。",
    },
    {
      question: "睡眠ボタンを普通に押すとどうなる？",
      answer: "現在時刻で入眠または起床を記録します。長押しした場合だけ、時刻を指定して記録できます。",
    },
    {
      question: "食事やおむつを記録すると自動で起床になることがあるのはなぜ？",
      answer: "睡眠中にミルク・離乳食・おむつの活動が記録された場合、実際の活動時刻に合わせて自動起床を補助することがあります。必要なら記録後にログから修正できます。",
    },
    {
      question: "過去の日の記録を見るには？",
      answer: "ログの日付欄で前後の日へ移動できます。タイムラインでは1週間単位で記録の流れを確認できます。",
    },
    {
      question: "夫婦・家族で同じ記録を共有できる？",
      answer: "家族共有が有効な場合は同じ家族に参加した端末間で同期されます。誰が入力・更新した記録かもログから確認できます。",
    },
    {
      question: "別の端末で入れた記録が見えないときは？",
      answer: "同期アイコンや未同期表示を確認してください。通信が戻ると自動同期されます。長く反映されない場合は一度画面を再読み込みしてください。",
    },
    {
      question: "赤ちゃんの名前や音声で呼ぶ名前を変えたい",
      answer: "歯車の設定からプロフィールを開き、「表示名」「音声入力名」を変更できます。音声入力名は呼び方を複数登録できます。",
    },
    {
      question: "ゲージの目安を自分たちに合わせたい",
      answer: "設定からミルクの時間・目安量、活動時間、必要睡眠時間などを調整できます。初期値へ戻すこともできます。",
    },
    {
      question: "横長のタブレットで2人を同時表示したい",
      answer: "設定の「画面レイアウト」で左右2人表示を選べます。十分な横幅がある端末では2人の入力画面を並べて使えます。",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            使い方・ヘルプ
          </DialogTitle>
          <DialogDescription>
            Twinlyの操作で迷いやすいポイントをまとめています。
          </DialogDescription>
        </DialogHeader>

        <Button
          className="mt-2 h-auto w-full justify-start gap-3 rounded-xl px-4 py-3 text-left"
          onClick={onReplayTutorial}
        >
          <PlayCircle className="h-5 w-5 shrink-0" />
          <span>
            <span className="block font-bold">チュートリアルをもう一度見る</span>
            <span className="mt-0.5 block text-xs font-normal opacity-80">実際の操作を順番に練習します</span>
          </span>
        </Button>

        <div className="mt-4 divide-y rounded-xl border bg-card">
          {faqs.map((faq) => (
            <details key={faq.question} className="group px-4 py-1">
              <summary className="cursor-pointer list-none py-3 pr-6 text-sm font-semibold marker:hidden">
                <span className="flex items-start justify-between gap-3">
                  <span>{faq.question}</span>
                  <span className="mt-0.5 text-base leading-none text-muted-foreground transition-transform group-open:rotate-45">＋</span>
                </span>
              </summary>
              <p className="pb-4 pr-6 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
