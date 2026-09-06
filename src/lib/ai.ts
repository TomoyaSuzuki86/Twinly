import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import type { BabyId, DiaperKind } from '@/types';

export type FamilyAccess = { plan: 'free' | 'premium'; canPreview: boolean; features: { aiVoice: boolean; aiReview: boolean; themes?: boolean; gauges?: boolean; stockForecast?: boolean; stockNotifications?: boolean; familySharing?: boolean; music?: boolean } };
export type AiDraft = { babyId: BabyId; type: 'milk'|'diaper'|'solidFood'|'sleepStart'|'wake'; timestamp: number|null; milkMl?: number; diaperKind?: DiaperKind; clarification: string };
export type AiReview = { observations: string; checks: string; generatedAt: number };
export async function callService<T>(name: string, data: unknown = {}): Promise<T> {
  if (!functions) throw new Error('サーバー設定がありません');
  return (await httpsCallable<unknown,T>(functions,name)(data)).data;
}
export function validConfirmedDrafts(events: AiDraft[], now=Date.now()): boolean {
  return events.length>0 && events.length<=12 && events.every(e =>
    ['A','B'].includes(e.babyId) && ['milk','diaper','solidFood','sleepStart','wake'].includes(e.type) &&
    typeof e.timestamp==='number' && Number.isFinite(e.timestamp) && e.timestamp>=now-7*86400000 && e.timestamp<=now+60000 &&
    (e.type!=='milk'||(Number.isInteger(e.milkMl)&&e.milkMl!>=0&&e.milkMl!<=1000)) &&
    (e.type!=='diaper'||['pee','poop','mix'].includes(e.diaperKind||'')));
}
