import {
  Baby,
  Bot,
  CheckCircle2,
  Clock3,
  Mail,
  MessageCircleQuestion,
  PackageSearch,
  Users,
} from "lucide-react";

const ScreenFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-[1.35rem] border bg-background shadow-sm">
    <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
      <span>9:41</span>
      <span className="font-semibold text-foreground">Twinly</span>
      <span>●●●</span>
    </div>
    <div className="min-h-[245px] p-3">{children}</div>
  </div>
);

const Gauge = ({ label, left, right, leftWidth, rightWidth }: { label: string; left: string; right: string; leftWidth: string; rightWidth: string }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-[10px] font-semibold"><span>{label}</span><span className="text-muted-foreground">奏汰 / 日向</span></div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: leftWidth }} /></div>
        <div className="mt-1 text-[9px] text-muted-foreground">{left}</div>
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: rightWidth }} /></div>
        <div className="mt-1 text-[9px] text-muted-foreground">{right}</div>
      </div>
    </div>
  </div>
);

const showcase = [
  {
    key: "ai",
    title: "AIアドバイス",
    subtitle: "記録から、今見るべきことがわかる",
    icon: Bot,
    screen: (
      <ScreenFrame>
        <div className="text-[11px] font-bold">今日のAIアドバイス</div>
        <div className="mt-3 rounded-xl border bg-primary/5 p-3">
          <div className="text-[10px] font-semibold text-primary">最近の傾向</div>
          <p className="mt-1 text-[10px] leading-relaxed">ここ3日、2人とも夜の睡眠が少し短めです。特に日向は夕方の活動時間が長くなっています。</p>
        </div>
        <div className="mt-2 rounded-xl border p-3">
          <div className="text-[10px] font-semibold">今日のポイント</div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">夕方の授乳後は照明を少し落として、寝る前の刺激を減らしてみましょう。</p>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-[9px] text-muted-foreground">
          <MessageCircleQuestion className="h-3 w-3" /> この傾向についてAIに質問…
        </div>
      </ScreenFrame>
    ),
  },
  {
    key: "gauges",
    title: "お世話ゲージ",
    subtitle: "2人の今が、一目でわかる",
    icon: Baby,
    screen: (
      <ScreenFrame>
        <div className="flex items-center justify-between">
          <div><div className="text-[10px] font-bold">奏汰</div><div className="text-[9px] text-muted-foreground">5か月</div></div>
          <div className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold text-primary">現在</div>
          <div className="text-right"><div className="text-[10px] font-bold">日向</div><div className="text-[9px] text-muted-foreground">5か月</div></div>
        </div>
        <div className="mt-4 space-y-4">
          <Gauge label="ミルク" left="あと40ml" right="あと90ml" leftWidth="78%" rightWidth="55%" />
          <Gauge label="おむつ" left="1時間10分" right="2時間05分" leftWidth="45%" rightWidth="82%" />
          <Gauge label="活動時間" left="1時間25分" right="55分" leftWidth="68%" rightWidth="42%" />
        </div>
        <div className="mt-4 rounded-lg bg-muted/40 p-2 text-[9px] text-muted-foreground">次のお世話の優先度を、2人分まとめて確認できます。</div>
      </ScreenFrame>
    ),
  },
  {
    key: "mail",
    title: "今日のまとめメール",
    subtitle: "1日の記録を家族へ自動で共有",
    icon: Mail,
    screen: (
      <ScreenFrame>
        <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary"/><div className="text-[11px] font-bold">Twinly 今日のまとめ</div></div>
        <div className="mt-1 text-[9px] text-muted-foreground">9月6日（日）</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
          {[
            ["奏汰", "ミルク 920ml", "睡眠 13時間18分", "おしっこ 7回", "うんち 1回"],
            ["日向", "ミルク 880ml", "睡眠 12時間42分", "おしっこ 8回", "うんち 2回"],
          ].map(([name, ...items]) => (
            <div key={name} className="rounded-xl border p-2">
              <div className="font-bold">{name}</div>
              {items.map(item => <div key={item} className="mt-1 text-muted-foreground">{item}</div>)}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-primary/5 p-2 text-[9px] leading-relaxed">今日もおつかれさまでした。2人とも昨日と大きく異なる変化はありませんでした。</div>
      </ScreenFrame>
    ),
  },
  {
    key: "stock",
    title: "おむつ在庫予測",
    subtitle: "なくなる前に、ちゃんと気づける",
    icon: PackageSearch,
    screen: (
      <ScreenFrame>
        <div className="text-[11px] font-bold">おむつ在庫</div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between rounded-xl border p-3 text-[10px]"><span className="font-semibold">Sサイズ</span><span>28枚・約14日</span></div>
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between text-[10px]"><span className="font-bold">Mサイズ</span><span className="font-bold text-primary">残り10枚</span></div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary"><Clock3 className="h-3 w-3" /> あと5日でなくなる見込み</div>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3 text-[10px]"><span className="font-semibold">Lサイズ</span><span>42枚・約21日</span></div>
        </div>
        <div className="mt-3 rounded-lg bg-muted/40 p-2 text-[9px] text-muted-foreground">使用ペースから買い足しタイミングを自動予測します。</div>
      </ScreenFrame>
    ),
  },
  {
    key: "family",
    title: "家族共有",
    subtitle: "誰が見ても、2人の今がわかる",
    icon: Users,
    screen: (
      <ScreenFrame>
        <div className="flex items-center justify-between"><div className="text-[11px] font-bold">家族の記録</div><div className="text-[9px] text-primary">4人で共有中</div></div>
        <div className="mt-3 flex -space-x-1.5">
          {["パパ", "ママ", "ばば", "じじ"].map((name, index) => <div key={name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary/10 text-[8px] font-semibold" style={{ zIndex: 5-index }}>{name}</div>)}
        </div>
        <div className="mt-4 space-y-3 border-l pl-3">
          {[
            ["08:12", "ママ", "奏汰 ミルク180ml"],
            ["10:03", "パパ", "日向 おむつ交換（うんち）"],
            ["12:20", "ばば", "2人ともお昼寝"],
          ].map(([time, who, detail]) => <div key={time} className="relative text-[9px]"><span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full bg-primary"/><div className="font-semibold">{time}　{who}</div><div className="mt-0.5 text-muted-foreground">{detail}</div></div>)}
        </div>
      </ScreenFrame>
    ),
  },
];

export function PremiumFeatureShowcase() {
  return (
    <>
      <section>
        <div className="mb-3">
          <h3 className="font-bold">Premiumを、画面で見てみる</h3>
          <p className="mt-1 text-xs text-muted-foreground">実際のTwinlyの見た目に合わせたデモ画面です。表示データはサンプルです。</p>
        </div>
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {showcase.map(({ key, title, subtitle, icon: Icon, screen }) => (
            <article key={key} className="w-[82%] max-w-[330px] flex-none snap-center rounded-2xl border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-start gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4"/></div>
                <div><div className="text-sm font-bold">{title}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div></div>
              </div>
              {screen}
            </article>
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">横にスワイプして機能を見る</p>
      </section>

      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5">
        <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4 text-primary"/>Twinlyをつくった理由</div>
        <h3 className="mt-3 text-lg font-bold leading-snug">双子育児を、少しでもラクに。自分たちが本当に欲しかったアプリを作りました。</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Twinlyは、私たち夫婦が双子育児をする中から生まれました。</p>
          <p>新生児期、2人分のミルク、おむつ、睡眠を追いながら、「双子に特化していて、もっと素早く記録できるアプリがあれば」と何度も感じました。見つからなかったので、自分たちで作ることにしました。</p>
          <p>それから毎日の育児で実際に使いながら、必要だった機能を一つずつ追加し、改良を重ねています。Twinlyには、机上のアイデアではなく、私たちが双子育児の現場で「これが欲しい」と思ったものを詰め込んでいます。</p>
          <p>まだ完成ではありません。これからも夫婦で全力で2人を育てながら、Twinlyももっと頼れるアプリへ育てていきます。</p>
        </div>
        <div className="mt-4 rounded-xl bg-background/70 p-3 text-sm font-semibold leading-relaxed">
          Premiumへのアップグレードは、便利な追加機能を使えるだけでなく、Twinlyをこれからも育て続ける力になります。もしこのアプリを気に入っていただけたら、応援していただけると嬉しいです。
        </div>
      </section>
    </>
  );
}
