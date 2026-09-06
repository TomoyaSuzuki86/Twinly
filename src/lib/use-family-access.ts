import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { callService, FamilyAccess } from './ai';

export function useFamilyAccess(uid?: string, familyId?: string) {
  const [state, setState] = useState<{key:string;access:FamilyAccess|null;error:string}>({key:'',access:null,error:''});
  const key = `${uid}:${familyId}`;
  useEffect(() => {
    if (!uid || !familyId || !db) return;
    let active = true, revision = 0;
    const refresh = () => {
      const current = ++revision;
      callService<FamilyAccess>('getFamilyAccess').then(access => {
        if (active && current === revision) setState({key,access,error:''});
      }).catch(() => { if (active && current === revision) setState({key,access:null,error:'プランを確認できません。再読み込みしてください。'}); });
    };
    const stop = onSnapshot(doc(db,'families',familyId,'services','access'), refresh, () => {
      if(active) setState({key,access:null,error:'プランの同期が停止しました。再読み込みしてください。'});
    });
    return () => { active=false; stop(); };
  }, [key,uid,familyId]);
  return state.key === key ? state : {access:null,error:''};
}
