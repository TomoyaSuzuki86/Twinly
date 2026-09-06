import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { createSleepSound, sleepMusicDeadline } from '@/lib/sleep-music';
import type { AppState } from '@/types';
import type { FamilyAccess } from '@/lib/ai';

const tracks = [['white','ホワイトノイズ'],['musicBox','星のオルゴール'],['heartbeat','心音風'],['shush','シーッという音'],['rain','やさしい雨']];
export function ComfortTools({access,app,familyId}:{access:FamilyAccess|null;app:AppState;familyId:string}) {
  const [open,setOpen]=useState(false), [playing,setPlaying]=useState(''), [message,setMessage]=useState('');
  const [volume,setVolume]=useState(0.55);
  const player=useRef<{context:AudioContext;source:AudioBufferSourceNode;gain:GainNode;previewEnd:number|null}|null>(null);
  const operation=useRef(0);
  const deadline=sleepMusicDeadline(app.events,app.sleepManagementEnabled);
  const latest=useRef({deadline,volume,premium:Boolean(access?.features.music)});
  latest.current={deadline,volume,premium:Boolean(access?.features.music)};
  function stop() {operation.current++;const p=player.current;player.current=null;if(p){p.source.onended=null;void p.context.close();}setPlaying('');}
  function schedule() {
    const p=player.current;if(!p)return;
    const state=latest.current;
    const end=Math.min(state.deadline??Infinity,p.previewEnd??Infinity);
    const remaining=(end-Date.now())/1000;
    if(remaining<=0){stop();setMessage('自動停止しました');return;}
    const t=p.context.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(state.volume,t);
    // A long stop replaces a previously scheduled sleep stop when either baby wakes.
    p.source.stop(t+(Number.isFinite(remaining)?remaining:365*86400));
    if(Number.isFinite(remaining)){
      p.gain.gain.setValueAtTime(state.volume,t+Math.max(0,remaining-10));
      p.gain.gain.linearRampToValueAtTime(0,t+remaining);
    }
  }
  async function play(track:string) {
    stop();setMessage('');
    if(latest.current.deadline!==null&&latest.current.deadline<=Date.now()){setMessage('2人の入眠から15分が経過したため、自動停止中です');return;}
    const request=operation.current;
    const context=new AudioContext();
    try {
      await context.resume();
      if(request!==operation.current){void context.close();return;}
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=createSleepSound(context,track);source.loop=true;source.connect(gain);gain.connect(context.destination);
      player.current={context,source,gain,previewEnd:track!=='white'&&!latest.current.premium?Date.now()+12000:null};
      gain.gain.value=0;source.start();setPlaying(track);schedule();
      source.onended=()=>{if(player.current?.source===source){stop();setMessage('自動停止しました');}};
    }catch{void context.close();setMessage('音声を再生できません。もう一度お試しください');}
  }
  useEffect(()=>{schedule();},[deadline,volume]);
  useEffect(()=>{if(!access?.features.music&&playing&&playing!=='white'&&player.current?.previewEnd===null){stop();setMessage('無料モードへ切り替えたため停止しました。12秒試聴できます');}},[access,playing]);
  useEffect(()=>{
    const visible=()=>{if(document.visibilityState==='visible')schedule();};
    document.addEventListener('visibilitychange',visible);
    return()=>{document.removeEventListener('visibilitychange',visible);operation.current++;void player.current?.context.close();player.current=null;};
  },[]);
  return <>
    <Button variant="ghost" size="icon" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onClick={()=>setOpen(true)} aria-label="おやすみ音楽">{playing?'♫':'♪'}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>おやすみ音楽</DialogTitle><DialogDescription>2人が入眠すると、15分後に自動停止します。最後の10秒で音を小さくします。</DialogDescription></DialogHeader>
      <p className="text-xs text-muted-foreground">赤ちゃんの頭から離し、無理のない音量で使ってください。</p>
      <div className="grid gap-2">{tracks.map(([id,label])=><Button key={id} variant={playing===id?'default':'outline'} onClick={()=>void play(id)}>{label}{id!=='white'&&!access?.features.music?'（12秒試聴）':''}{playing===id?'・再生中':''}</Button>)}</div>
      <label className="flex items-center gap-3">音量 <input aria-label="音量" className="flex-1 accent-primary" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/> <span className="w-10 text-right text-sm tabular-nums">{Math.round(volume*100)}%</span></label>
      <Button variant="outline" disabled={!playing} onClick={stop}>停止</Button>
      {deadline!==null&&<p className="text-sm">自動停止予定：{new Date(deadline).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</p>}
      {message&&<p role="status">{message}</p>}
    </DialogContent></Dialog>
  </>;
}
