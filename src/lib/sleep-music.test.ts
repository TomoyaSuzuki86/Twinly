import { it, expect } from 'vitest';
import { sleepMusicDeadline } from './sleep-music';
import type { LogEvent } from '@/types';
it('stops 15 minutes after the later sleep and cancels when either wakes',()=>{
  const events:LogEvent[]=[{id:'a',babyId:'A',type:'sleepStart',timestamp:1000000},{id:'b',babyId:'B',type:'sleepStart',timestamp:1100000}];
  expect(sleepMusicDeadline(events,true)).toBe(2000000);
  expect(sleepMusicDeadline(events.slice(0,1),true)).toBeNull();
  expect(sleepMusicDeadline([...events,{id:'w',babyId:'A',type:'wake',timestamp:1200000}],true)).toBeNull();
  expect(sleepMusicDeadline(events,false)).toBeNull();
});
