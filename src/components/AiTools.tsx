import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import type { AiDraft, AiReview, DailySummaryEmailSettings, FamilyAccess } from '@/lib/ai';
import { callService } from '@/lib/ai';
import type { AppState } from '@/types';

type AiToolsProps = {
  familyId: string;
  app: AppState;
  onSave: (events: AiDraft[]) => boolean;
  embedded?: boolean;
};

const defaultEmailSettings: DailySummaryEmailSettings = { enabled:false, hourJst:21, recipients:[], canEdit:false };

export function AiTools({familyId,embedded=false}:AiToolsProps) {
  const [open,setOpen]=useState(false);
  const [access,setAccess]=useState<FamilyAccess|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [consent,setConsent]=useState(false);
  const [review,setReview]=useState<AiReview|null>(null);
  const [emailSettings,setEmailSettings]=useState<DailySummaryEmailSettings>(defaultEmailSettings);
  const generation=useRef(0), mounted=useRef(true), inFlight=useRef(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{
    let active=true, revision=0;
    const refresh=()=>{
      const current=++revision;
      generation.current++;
      setAccess(null);setReview(null);
      callService<FamilyAccess>('getFamilyAccess').then(value=>{
        if(!active||current!==revision)return;
        setAccess(value);
        return callService<DailySummaryEmailSettings>('getDailySummaryEmailSettings').then(settings=>{
          if(active&&current===revision)setEmailSettings(settings);
        });
      }).catch(()=>{if(active&&current===revision)setError('機能設定を取得できません。サーバーの配備と接続を確認してください');});
    };
    refresh();
    const unsubscribe=db?onSnapshot(doc(db,'families',familyId,'services','access'),refresh,()=>{setAccess(null);setError('機能設定の同期に失敗しました');}):()=>{};
    return()=>{active=false;unsubscribe();generation.current++;};
  },[familyId]);

  async function run(task:()=>Promise<void>) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {await task();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'処理に失敗しました');}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }

  const aiAllowed=Boolean(access?.features.aiReview||access?.features.aiChat);
  const canEditEmail=Boolean(emailSettings.canEdit);
  const canToggleEmail=Boolean(access?.features.dailySummaryEmail||emailSettings.enabled);

  const content = (
    <div className="space-y-4">
      {embedded ? (
        <div>
          <h3 className="font-semibold">有料機能のお試し</h3>
          <p className="mt-1 text-sm text-muted-foreground">有料プランの機能切替と、記録に基づくAI機能をここで確認できます。</p>
        </div>
      ) : null}

      <p className="text-sm">現在：{access?(access.plan==='premium'?'有料機能のお試し':'無料モード'):'確認中'}。課金は発生しません。AI APIの利用料は別途かかる場合があります。</p>
      {access?.canPreview && <Button disabled={busy} role="switch" aria-checked={access.plan==='premium'} onClick={()=>run(async()=>{
        generation.current++;setReview(null);
        const next=await callService<FamilyAccess>('setFamilyPreviewPlan',{plan:access.plan==='premium'?'free':'premium'});
        if(mounted.current)setAccess(next);
      })}>有料機能のお試し：{access.plan==='premium'?'ON':'OFF'}</Button>}
      <p className="text-sm font-semibold">有料版：月500円・1週間無料体験（提供予定）</p>
      <p className="text-xs text-muted-foreground">現在は家族向けのお試しです。決済や自動課金は行いません。</p>
      <div className="grid grid-cols-2 gap-2 text-xs">{[
        ['themes','背景テーマ'],['gauges','各種ゲージ'],['stockForecast','在庫切れ予測'],['stockNotifications','在庫予測通知'],
        ['familySharing','家族共有'],['music','複数音楽'],['aiReview','AIアドバイス'],['aiChat','AIに質問'],['dailySummaryEmail','日次まとめメール'],
      ].map(([key,label])=><div key={key} className="rounded border p-2">{label}：{access?.features[key as keyof FamilyAccess['features']]?'開放':'制限中'}</div>)}</div>
      <p className="text-xs">無料でも基本記録・通常音声・在庫数管理・ホワイトノイズを利用でき、有料音楽を12秒試聴できます。複雑な自然文をAIで記録へ変換する機能は提供しません。</p>
      {!aiAllowed && <p className="rounded border p-3 text-sm">AI機能はロック中です。家族のオーナーがお試しをONにすると利用できます。</p>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={!aiAllowed||busy} onChange={e=>setConsent(e.target.checked)}/>AIアドバイス生成時、登録名・生年月日・直近2週間の育児集計をGoogleのAPIへ送信することに同意する</label>

      <section className="space-y-3 border-t pt-3">
        <h3 className="font-bold">直近2週間のAIアドバイス</h3>
        <p className="text-xs text-muted-foreground">今日を除く直近14日を中心に、ミルク・おむつ・離乳食・睡眠・体重・メモを双子で比較し、変化と今日見るポイントをまとめます。ホームの「AIアドバイス」からは、その内容について続けて質問できます。</p>
        <Button disabled={!access?.features.aiReview||!consent||busy} onClick={()=>run(async()=>{
          const current=generation.current;
          const result=await callService<AiReview>('twinlyAi',{mode:'review'});
          if(mounted.current&&current===generation.current)setReview(result);
        })}>AIアドバイスを見る</Button>
        {review&&<div className="space-y-2 whitespace-pre-wrap text-sm">
          <h4 className="font-bold">最近の傾向</h4><p>{review.observations}</p>
          <h4 className="font-bold">今日のポイント</h4><p>{review.checks}</p>
          <p className="text-xs">{new Date(review.generatedAt).toLocaleString('ja-JP')}作成。医療上の診断ではありません。</p>
        </div>}
      </section>

      <section className="space-y-3 border-t pt-3">
        <h3 className="font-bold">家族への今日のまとめメール</h3>
        <p className="text-xs text-muted-foreground">毎日指定した時刻に、その時点のミルク量・睡眠時間・おしっこ・うんち・離乳食回数を家族メンバーへまとめて送ります。数値はAIではなくTwinlyが集計します。</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailSettings.enabled} disabled={!canEditEmail||!canToggleEmail||busy} onChange={e=>setEmailSettings(value=>({...value,enabled:e.target.checked}))}/>毎日メールを送る</label>
        <label className="flex items-center gap-2 text-sm">送信時刻
          <select aria-label="日次まとめメール送信時刻" className="rounded border bg-background px-2 py-1" value={emailSettings.hourJst} disabled={!canEditEmail||busy} onChange={e=>setEmailSettings(value=>({...value,hourJst:Number(e.target.value)}))}>
            {Array.from({length:24},(_,hour)=><option key={hour} value={hour}>{String(hour).padStart(2,'0')}:00</option>)}
          </select>
        </label>
        <div className="text-xs text-muted-foreground">送信先：{emailSettings.recipients.length?emailSettings.recipients.join(' / '):'メールアドレスが登録された家族メンバーがいません'}</div>
        <Button disabled={!canEditEmail||busy||(emailSettings.enabled&&!access?.features.dailySummaryEmail)} onClick={()=>run(async()=>{
          const result=await callService<DailySummaryEmailSettings>('setDailySummaryEmailSettings',{enabled:emailSettings.enabled,hourJst:emailSettings.hourJst});
          if(mounted.current){setEmailSettings(result);setError('日次まとめメールの設定を保存しました');}
        })}>メール設定を保存</Button>
        {!canEditEmail&&<p className="text-xs text-muted-foreground">この設定は家族のオーナーのみ変更できます。</p>}
      </section>

      {busy&&<p role="status">処理中…</p>}{error&&<p role="status" className="text-sm">{error}</p>}
    </div>
  );

  if (embedded) return content;

  return <>
    <Button variant="ghost" size="sm" className="px-2 text-xs" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onClick={()=>setOpen(true)}>プラン・AI</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>有料機能のお試し</DialogTitle>
          <DialogDescription>有料プランの機能切替と、記録に基づくAI機能を確認できます。</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  </>;
}
