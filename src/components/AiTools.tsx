import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { VoiceCommandButton } from './VoiceCommandButton';
import { AiDraft, AiReview, FamilyAccess, callService, validConfirmedDrafts } from '@/lib/ai';
import { createVoiceCommandBabyNames } from '@/lib/voice-command';
import type { AppState } from '@/types';

const labels = {milk:'ミルク',diaper:'おむつ',solidFood:'離乳食',sleepStart:'入眠',wake:'起床'};
const dateInput = (time:number|null) => time===null?'':new Date(time-new Date(time).getTimezoneOffset()*60000).toISOString().slice(0,16);

export function AiTools({familyId,app,onSave}:{familyId:string;app:AppState;onSave:(events:AiDraft[])=>boolean}) {
  const [open,setOpen]=useState(false), [access,setAccess]=useState<FamilyAccess|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [text,setText]=useState('');
  const [consent,setConsent]=useState(false), [drafts,setDrafts]=useState<AiDraft[]>([]);
  const [review,setReview]=useState<AiReview|null>(null), [referenceTime,setReferenceTime]=useState(Date.now());
  const generation=useRef(0), mounted=useRef(true), inFlight=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{
    let active=true, revision=0;
    const refresh=()=>{
      const current=++revision;
      // Fail closed while checking a cross-device plan change.
      generation.current++;setAccess(null);setDrafts([]);setReview(null);
      callService<FamilyAccess>('getFamilyAccess').then(value=>{if(active&&current===revision)setAccess(value);})
        .catch(()=>{if(active&&current===revision)setError('機能設定を取得できません。サーバーの配備と接続を確認してください');});
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
  function receiveText(value:string){setText(value);setReferenceTime(Date.now());setDrafts([]);}
  const allowed=Boolean(access?.features.aiVoice);
  return <>
    <Button variant="ghost" size="sm" className="px-2 text-xs" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onClick={()=>setOpen(true)}>プラン・AI</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>AIと機能のお試し</DialogTitle><DialogDescription>家族の機能切替と、記録に基づくAIの補助機能です。</DialogDescription></DialogHeader>
        <p className="text-sm">現在：{access?(access.plan==='premium'?'有料機能のお試し':'無料モード'):'確認中'}。課金は発生しません。AI APIの利用料は別途かかる場合があります。</p>
        {access?.canPreview && <Button disabled={busy} role="switch" aria-checked={access.plan==='premium'} onClick={()=>run(async()=>{
          generation.current++;setDrafts([]);setReview(null);
          const next=await callService<FamilyAccess>('setFamilyPreviewPlan',{plan:access.plan==='premium'?'free':'premium'});
          if(mounted.current)setAccess(next);
        })}>有料機能のお試し：{access.plan==='premium'?'ON':'OFF'}</Button>}
        <p className="text-sm font-semibold">有料版：月500円・1週間無料体験（提供予定）</p>
        <p className="text-xs text-muted-foreground">現在は家族向けのお試しです。決済や自動課金は行いません。</p>
        <div className="grid grid-cols-2 gap-2 text-xs">{[['themes','背景テーマ'],['gauges','各種ゲージ'],['stockForecast','在庫切れ予測'],['stockNotifications','在庫予測通知'],['familySharing','家族共有'],['music','複数音楽'],['aiVoice','Gemini高度音声入力'],['aiReview','AIアドバイス']].map(([key,label])=><div key={key} className="rounded border p-2">{label}：{access?.features[key as keyof FamilyAccess['features']]?'開放':'制限中'}</div>)}</div>
        <p className="text-xs">無料でも基本記録・通常音声・在庫数管理・ホワイトノイズを利用でき、有料音楽を12秒試聴できます。無料への切替中、管理者以外の家族メンバーは共有記録を利用できません。</p>
        {!allowed && <p className="rounded border p-3 text-sm">AI機能はロック中です。家族のオーナーがお試しをONにすると利用できます。</p>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={!allowed||busy} onChange={e=>setConsent(e.target.checked)}/>AI利用時、GoogleのAPIへ入力文・登録名と別名（音声解析）、または登録名・生年月日・直近2週間の育児集計とメモ（AIアドバイス）を送信することに同意する</label>
        <section className="space-y-3 border-t pt-3">
          <h3 className="font-bold">話した内容をまとめて記録</h3>
          <p className="text-xs text-muted-foreground">例：奏汰はミルク70、日向は15分前に20飲んで、その後おしっこも替えた</p>
          <div className="flex items-center gap-2">{allowed&&!busy&&<VoiceCommandButton babyNames={createVoiceCommandBabyNames(app.profiles)} onCommand={()=>{}} onMessage={setError} onTranscript={receiveText}/>}<span className="text-sm">音声またはテキストで入力</span></div>
          <textarea aria-label="AIで解析する育児記録" className="w-full rounded border bg-background p-2" rows={3} maxLength={1500} disabled={!allowed||busy} value={text} onChange={e=>receiveText(e.target.value)}/>
          <Button disabled={!allowed||!consent||busy||!text.trim()} onClick={()=>run(async()=>{
            const current=generation.current;
            const result=await callService<{events:AiDraft[]}>('twinlyAi',{mode:'voice',text,referenceTime});
            if(mounted.current&&current===generation.current)setDrafts(result.events);
          })}>AIで解析して確認</Button>
          {drafts.map((event,i)=><div key={i} className="space-y-2 rounded border p-3">
            <div className="flex gap-2"><select aria-label={`記録${i+1}の対象`} className="bg-background" value={event.babyId} onChange={e=>setDrafts(v=>v.map((r,j)=>j===i?{...r,babyId:e.target.value as 'A'|'B'}:r))}>{(['A','B'] as const).map(id=><option key={id} value={id}>{app.profiles[id].displayName}</option>)}</select><b>{labels[event.type]}</b>{event.diaperKind&&<span>{({pee:'おしっこ',poop:'うんち',mix:'両方'})[event.diaperKind]}</span>}</div>
            {event.type==='milk'&&<label>量（ml）<input aria-label={`記録${i+1}の量`} className="w-24 border bg-background" type="number" min="0" max="1000" value={event.milkMl??''} onChange={e=>setDrafts(v=>v.map((r,j)=>j===i?{...r,milkMl:e.target.value===''?undefined:Number(e.target.value)}:r))}/></label>}
            <input aria-label={`記録${i+1}の時刻`} className="w-full border bg-background" type="datetime-local" value={dateInput(event.timestamp)} onChange={e=>setDrafts(v=>v.map((r,j)=>j===i?{...r,timestamp:e.target.value?new Date(e.target.value).getTime():null}:r))}/>
            <p className="text-xs">{event.clarification}{event.timestamp===null?' 時刻を入力してください。':''}</p>
            <button className="text-sm underline" onClick={()=>setDrafts(v=>v.filter((_,j)=>j!==i))}>この候補を除く</button>
          </div>)}
          {drafts.length>0&&<Button disabled={busy||!allowed||!validConfirmedDrafts(drafts)} onClick={()=>run(async()=>{
            const current=generation.current;
            const latest=await callService<FamilyAccess>('getFamilyAccess');
            if(!mounted.current||current!==generation.current)return;
            setAccess(latest);
            if(!latest.features.aiVoice)throw new Error('無料モードへ切り替わりました');
            if(!validConfirmedDrafts(drafts))throw new Error('対象・量・時刻を確認してください');
            if(onSave(drafts)){setDrafts([]);setText('');setError('保存しました。ホームの「取り消す」で一括Undoできます');}
          })}>確認した{drafts.length}件を保存</Button>}
        </section>
        <section className="space-y-3 border-t pt-3"><h3 className="font-bold">直近2週間のAIアドバイス</h3><p className="text-xs text-muted-foreground">今日を除く直近14日を中心に、ミルク・おむつ・離乳食・睡眠・体重・メモを双子で比較し、変化と今日見るポイントをまとめます。同じ日の生成結果は家族で共有します。</p>
          <Button disabled={!access?.features.aiReview||!consent||busy} onClick={()=>run(async()=>{const current=generation.current;const result=await callService<AiReview>('twinlyAi',{mode:'review'});if(mounted.current&&current===generation.current)setReview(result);})}>AIアドバイスを見る</Button>
          {review&&<div className="space-y-2 whitespace-pre-wrap text-sm"><h4 className="font-bold">最近の傾向</h4><p>{review.observations}</p><h4 className="font-bold">今日のポイント</h4><p>{review.checks}</p><p className="text-xs">{new Date(review.generatedAt).toLocaleString('ja-JP')}作成。医療上の診断ではありません。</p></div>}
        </section>
        {busy&&<p role="status">処理中…</p>}{error&&<p role="status" className="text-sm">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
