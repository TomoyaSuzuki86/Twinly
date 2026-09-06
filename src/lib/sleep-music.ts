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
  for (let i=0;i<samples.length;i++) {
    const t=i/rate;
    if(track === 'white') { samples[i] = (Math.random()*2-1)*0.34; continue; }
    if(track === 'rain') { samples[i] = (Math.random()*2-1)*0.18 + Math.sin(2*Math.PI*190*t)*0.015; continue; }
    if(track === 'shush') { samples[i] = (Math.random()*2-1)*(0.12+0.08*(0.5+0.5*Math.sin(2*Math.PI*.23*t))); continue; }
    if(track === 'heartbeat') {
      const phase=t%1.35, pulse=Math.exp(-Math.pow((phase-.10)/.045,2))+.62*Math.exp(-Math.pow((phase-.34)/.06,2));
      samples[i]=pulse*(Math.sin(2*Math.PI*58*t)*.38+Math.sin(2*Math.PI*116*t)*.10); continue;
    }
    const notes=[523.25,392,440,329.63,349.23,293.66,392,261.63], phase=t%2, note=notes[Math.floor(t/2)%notes.length];
    const envelope=Math.min(phase/.03,1)*Math.exp(-phase*2.1)*Math.min((2-phase)/.12,1);
    samples[i]=.42*envelope*(Math.sin(2*Math.PI*note*phase)+.12*Math.sin(4*Math.PI*note*phase));
  }
  return buffer;
}
