import {describe,it,expect,vi} from 'vitest';
vi.mock('@/firebase',()=>({functions:null}));
import {validConfirmedDrafts} from './ai';
describe('AI confirmation boundary',()=>{
  it('requires resolving ambiguous times and rejects out-of-range data',()=>{
    const now=Date.now();
    expect(validConfirmedDrafts([{babyId:'B',type:'diaper',diaperKind:'pee',timestamp:null,clarification:'その後'}],now)).toBe(false);
    expect(validConfirmedDrafts([{babyId:'B',type:'diaper',diaperKind:'pee',timestamp:now,clarification:''}],now)).toBe(true);
    expect(validConfirmedDrafts([{babyId:'A',type:'milk',milkMl:1001,timestamp:now,clarification:''}],now)).toBe(false);
    expect(validConfirmedDrafts([],now)).toBe(false);
  });
});
