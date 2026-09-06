import { analyzeSleepEvents } from './sleep';
import type { LogEvent } from '@/types';

export function sleepMusicDeadline(events: LogEvent[], enabled: boolean): number | null {
  if (!enabled) return null;
  const a = analyzeSleepEvents(events, 'A').currentSleepStart;
  const b = analyzeSleepEvents(events, 'B').currentSleepStart;
  return a && b ? Math.max(a.timestamp, b.timestamp) + 15 * 60000 : null;
}

// Original synthesized loops: no external music service or paid API.
export function createSleepSound(context: AudioContext, track: string) {
  const rate = context.sampleRate, duration = 16;
  const buffer = context.createBuffer(1, rate * duration, rate);
  const samples = buffer.getChannelData(0);
  const notes = track === 'moon' ? [261.63,329.63,392,329.63,293.66,349.23,440,349.23]
    : track === 'stars' ? [523.25,392,440,329.63,349.23,293.66,392,261.63]
    : [220,261.63,329.63,261.63,196,246.94,293.66,246.94];
  for (let i=0;i<samples.length;i++) {
    if(track === 'white') { samples[i] = (Math.random()*2-1)*0.2; continue; }
    const t=i/rate, beat=Math.floor(t/2), phase=t%2;
    const envelope=Math.min(phase/0.04,1)*Math.exp(-phase*2.5)*Math.min((2-phase)/0.08,1);
    samples[i]=0.18*envelope*(Math.sin(2*Math.PI*notes[beat]*phase)+0.15*Math.sin(4*Math.PI*notes[beat]*phase));
  }
  return buffer;
}
