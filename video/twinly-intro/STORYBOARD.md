# Twinly Intro Storyboard

**Format:** 1920x1080
**Audio:** calm modern underscore + soft UI clicks
**VO direction:** calm, reassuring, efficient, Japanese natural speech
**Style basis:** `DESIGN.md`

## Asset Audit

| Asset | Type | Assign to Beat | Role |
| --- | --- | --- | --- |
| `src/components/BabyPanel.tsx` | UI reference | Beat 1, 2 | Twin panel layout and button styling inspiration |
| `src/components/EventCard.tsx` | UI reference | Beat 2 | Log card visual language |
| `doc/mock/育児記録pwa_画面モック（横向きa_b・でかボタン）.jsx` | UI reference | Beat 1, 3 | Overall layout and tone |

## Beat 1 - Hook
**VO:** "Twinlyは、双子の記録をすばやく残せるWebアプリです。"

**Concept:** The frame opens on a dark, composed dashboard. The viewer understands the product in one glance: two babies, two columns, one clear system.

**Visual description:** Full-frame dark gradient background. Two glowing panels sit left and right. A/B labels float above them. 大きな「ミルク」「おむつ」ボタンがやわらかく着地する。上部バーにはアプリ名、PWA、同期状態が並ぶ。全体は静かで、精度が高く、すぐ使える感じ。

**Mood direction:** Premium caregiver tool, not a toy.

**Animation choreography:** Panels slide in from opposite sides, buttons pop with subtle scale, chips fade and settle.

**Transition:** Soft blur-through into the next beat.

## Beat 2 - Core Actions
**VO:** "左右2カラム。大きなボタン。ミルクも、おむつも、1タップで記録できます。"

**Concept:** The app becomes action-first. This beat should feel like speed without panic.

**Visual description:** ミルクボタンは青く、 おむつボタンは黄色く光る。左右それぞれにタップが入り、小さなログカードが時系列で積み上がる。時刻は読みやすく整っていて、下部にはUndo用のスナックバーが待機している。

**Mood direction:** Fast, tactile, reassuring.

**Animation choreography:** Button pulse, card cascade, timestamp count-in, snackbar slide-up.

**Transition:** Hard cut on the second tap.

## Beat 3 - Value + CTA
**VO:** "今日の合計も、ログも、すぐに見返せます。間違えてもUndoで戻せます。"

**Concept:** The product proves its value: totals, logs, and recovery. Then it closes by signaling the next step in the journey.

**Visual description:** ミルク合計がカウントアップし、おむつ回数も増える。Undoのスナックバーが強調され、日次ログには短い記録が並ぶ。最後はTwinlyの名前にやさしく寄って、カレンダー出力や家族共有につながる未来を示す。

**Mood direction:** Clear, trustworthy, future-ready.

**Animation choreography:** Counter count-up, log stack settle, final logo glow, CTA reveal.

**Transition:** Clean end hold with music tail.
