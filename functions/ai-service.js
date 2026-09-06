const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { accessFor, summarize, buildDailySummary } = require('./ai-policy');

const key = defineSecret('TWINLY_AI_API_KEY');
const model = defineString('TWINLY_AI_MODEL', { default: 'gemini-3.6-flash' });
const options = { region: 'asia-northeast1', maxInstances: 1, timeoutSeconds: 60, invoker: 'public' };
const REVIEW_VERSION = 3;
const DAY = 86400000;
const JST = 9 * 3600000;

function replaceBabyLabels(text, summary) {
  let value = String(text);
  for (const baby of summary) {
    const id = baby.babyId;
    const name = baby.name || id;
    value = value.replace(new RegExp(`赤ちゃん${id}`, 'g'), name);
    value = value.replace(new RegExp(`(^|[^A-Za-z0-9])${id}(?=[^A-Za-z0-9]|$)`, 'g'), (_match, prefix) => `${prefix}${name}`);
  }
  return value;
}

const publicReview = data => ({
  observations: String(data?.observations || ''),
  checks: String(data?.checks || ''),
  generatedAt: Number(data?.generatedAt || 0),
});

const needsTimeline = question => /(何時|いつ|直前|直後|前後|起きる前|寝る前|間隔|タイミング|続けて|その後|夜中|時間帯|相関|関連|パターン)/.test(question);
const wantsNotes = question => /(メモ|吐|体調|様子|ぐず|泣|機嫌|症状)/.test(question);
const wantsWeight = question => /(体重|kg|キロ)/i.test(question);

function compactChatContext(summary, question) {
  return summary.map(baby => ({
    babyId: baby.babyId,
    name: baby.name,
    ageDays: baby.ageDays,
    periods: baby.periods.map(period => ({
      from: period.from,
      to: period.to,
      milkMl: period.milkMl,
      milkCount: period.milkCount,
      solidFoodCount: period.solidFoodCount,
      diaperChanges: period.diaperChanges,
      peeCount: period.peeCount,
      poopCount: period.poopCount,
      sleepMinutes: period.sleepMinutes,
      nightSleepMinutes: period.nightSleepMinutes,
      sleepCount: period.sleepCount,
      daysWithAnyRecords: period.daysWithAnyRecords,
    })),
    daily: baby.daily.map(day => ({
      date: day.date,
      milkMl: day.milkMl,
      milkCount: day.milkCount,
      solidFoodCount: day.solidFoodCount,
      peeCount: day.peeCount,
      poopCount: day.poopCount,
      sleepMinutes: day.sleepMinutes,
      nightSleepMinutes: day.nightSleepMinutes,
      sleepCount: day.sleepCount,
      recordCount: day.recordCount,
    })),
    todaySoFar: {
      date: baby.todaySoFar.date,
      milkMl: baby.todaySoFar.milkMl,
      milkCount: baby.todaySoFar.milkCount,
      solidFoodCount: baby.todaySoFar.solidFoodCount,
      peeCount: baby.todaySoFar.peeCount,
      poopCount: baby.todaySoFar.poopCount,
      sleepMinutes: baby.todaySoFar.sleepMinutes,
      nightSleepMinutes: baby.todaySoFar.nightSleepMinutes,
      sleepCount: baby.todaySoFar.sleepCount,
      recordCount: baby.todaySoFar.recordCount,
    },
    ...(wantsWeight(question) ? { weights: baby.weights } : {}),
    ...(wantsNotes(question) ? { notes: baby.notes, todayNotes: baby.todayNotes } : {}),
  }));
}

function compactTimeline(events, now) {
  const from = now - 14 * DAY;
  return events
    .filter(event => Number.isFinite(event.timestamp) && event.timestamp >= from && event.timestamp <= now + 60000)
    .filter(event => ['milk','diaper','solidFood','sleepStart','wake'].includes(event.type))
    .sort((a,b) => a.timestamp - b.timestamp)
    .slice(-200)
    .map(event => ({
      babyId: event.babyId,
      type: event.type,
      timestamp: event.timestamp,
      ...(event.type === 'milk' && Number.isFinite(event.milkMl) ? {milkMl:event.milkMl} : {}),
      ...(event.type === 'diaper' && event.diaperKind ? {diaperKind:event.diaperKind} : {}),
    }));
}

const jstDate = now => new Date(now + JST).toISOString().slice(0,10);
const jstHour = now => Number(new Date(now + JST).toISOString().slice(11,13));

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDuration = minutes => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分`;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
};

function formatDailySummaryMail(summary) {
  const rows = summary.babies.map(baby => {
    const sleeping = baby.isSleeping ? '（現在睡眠中）' : '';
    return [
      baby.name,
      `ミルク ${baby.milkCount}回 / ${baby.milkMl}ml`,
      `睡眠 ${formatDuration(baby.sleepMinutes)}${sleeping}`,
      `おしっこ ${baby.peeCount}回 / うんち ${baby.poopCount}回`,
      `離乳食 ${baby.solidFoodCount}回`,
    ];
  });
  const time = new Date(summary.generatedAt).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
  const text = [
    `Twinly 今日のまとめ ${summary.date}`,
    `${time}時点の記録です。`,
    '',
    ...rows.flatMap(row => [...row,'']),
    '※ Twinlyに記録された内容を集計した日報です。医療上の診断ではありません。',
  ].join('\n');
  const html = `<h2>Twinly 今日のまとめ ${escapeHtml(summary.date)}</h2><p>${escapeHtml(time)}時点の記録です。</p>${rows.map(row => `<h3>${escapeHtml(row[0])}</h3><ul>${row.slice(1).map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`).join('')}<p><small>※ Twinlyに記録された内容を集計した日報です。医療上の診断ではありません。</small></p>`;
  return { subject:`Twinly 今日のまとめ ${summary.date}`, text, html };
}

module.exports = function createAiServices(db) {
  async function context(request) {
    if (!request.auth) throw new HttpsError('unauthenticated','ログインしてください');
    const uid = request.auth.uid;
    const user = await db.doc(`users/${uid}`).get();
    const familyId = user.data()?.activeFamilyId;
    if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) throw new HttpsError('permission-denied','家族情報を確認してください');
    const root = db.collection('families').doc(familyId);
    const [member, family] = await Promise.all([
      root.collection('members').doc(uid).get(),
      root.get(),
    ]);
    if (member.data()?.status !== 'active') throw new HttpsError('permission-denied','家族へのアクセス権がありません');
    const ref = root.collection('services').doc('access');
    const snap = await ref.get();
    const isOwner = member.data()?.role === 'owner' || family.data()?.ownerUid === uid;
    return { root, ref, uid, access: accessFor(snap.data(),true), canPreview: isOwner };
  }

  async function generate(system, data) {
    const selectedModel = model.value() || 'gemini-3.6-flash';
    if (!/^[a-zA-Z0-9.-]+$/.test(selectedModel)) throw new HttpsError('failed-precondition','AIモデル設定を確認してください');
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`, {
        method:'POST',
        headers:{'Content-Type':'application/json','x-goog-api-key':key.value()},
        signal:AbortSignal.timeout(40000),
        body:JSON.stringify({
          systemInstruction:{parts:[{text:system}]},
          contents:[{role:'user',parts:[{text:JSON.stringify(data)}]}],
          generationConfig:{maxOutputTokens:2048,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'minimal'}},
        }),
      });
    } catch {
      throw new HttpsError('unavailable','AIに接続できませんでした。入力は残っています');
    }
    if (!response.ok) {
      let details='';
      try { if(typeof response.text==='function') details=(await response.text()).slice(0,1000); } catch {}
      console.error('Gemini API request failed',{status:response.status,model:selectedModel,details});
      if(response.status===400) throw new HttpsError('failed-precondition','AIモデルへの送信設定が対応していません');
      if(response.status===401||response.status===403) throw new HttpsError('permission-denied','Gemini APIキーまたは利用権限を確認してください');
      if(response.status===404) throw new HttpsError('failed-precondition','指定したAIモデルを利用できません');
      if(response.status===429) throw new HttpsError('resource-exhausted','Gemini APIの利用上限に達しました');
      throw new HttpsError('unavailable','AIサービスが一時的に利用できません');
    }
    try {
      const body = await response.json();
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete');
      return JSON.parse(candidate.content.parts.filter(p => !p.thought).map(p=>p.text || '').join(''));
    } catch {
      throw new HttpsError('data-loss','AIの結果を読み取れませんでした');
    }
  }

  async function reserve(ctx, feature, reserveOptions = {}) {
    const now = Date.now();
    const day = jstDate(now);
    const month = day.slice(0,7);
    const daily = ctx.root.collection('aiUsage').doc(day);
    const monthly = ctx.root.collection('aiUsage').doc(month);
    await db.runTransaction(async tx => {
      const [a,d,m] = await Promise.all([tx.get(ctx.ref),tx.get(daily),tx.get(monthly)]);
      if (!accessFor(a.data(),ctx.access.trialAllowed).features[feature]) throw new HttpsError('permission-denied','無料モードではAI機能を利用できません');
      const dv=d.data()||{}, mv=m.data()||{};
      const reviewLimitReached = feature==='aiReview' && (dv.successfulReviews||0)>=2 && !reserveOptions.allowReviewRefresh;
      if ((dv.successfulCount||0)>=40 || (mv.successfulCount||0)>=600 || now-(dv.lastAt||0)<5000 || reviewLimitReached) throw new HttpsError('resource-exhausted','AI利用上限に達しました。通常の記録は引き続き使えます');
      tx.set(daily,{...dv,lastAt:now});
    });
    return { day, month, feature };
  }

  async function commitUsage(ctx, reservation) {
    const daily = ctx.root.collection('aiUsage').doc(reservation.day);
    const monthly = ctx.root.collection('aiUsage').doc(reservation.month);
    await db.runTransaction(async tx => {
      const [d,m] = await Promise.all([tx.get(daily),tx.get(monthly)]);
      const dv=d.data()||{}, mv=m.data()||{};
      tx.set(daily,{...dv,successfulCount:(dv.successfulCount||0)+1,successfulReviews:(dv.successfulReviews||0)+(reservation.feature==='aiReview'?1:0)});
      tx.set(monthly,{...mv,successfulCount:(mv.successfulCount||0)+1});
    });
  }

  async function loadEvents(root, state, from, to, limit=3001) {
    const app = state.data()?.app;
    if (state.data()?.schemaVersion === 2) {
      const rows = await root.collection('events').where('timestamp','>=',from).where('timestamp','<=',to).orderBy('timestamp').limit(limit).get();
      if(rows.size >= limit) throw new HttpsError('resource-exhausted','対象期間の記録が多すぎます');
      return rows.docs.map(doc => doc.data());
    }
    return (app?.events || []).filter(event => Number.isFinite(event.timestamp) && event.timestamp >= from && event.timestamp <= to);
  }

  async function familyEmails(root) {
    const members = await root.collection('members').where('status','==','active').get();
    const uids = members.docs.map(doc => doc.id).slice(0,100);
    if (!uids.length) return [];
    const users = await admin.auth().getUsers(uids.map(uid => ({uid})));
    return [...new Set(users.users.map(user => String(user.email || '').trim()).filter(Boolean))];
  }

  const getFamilyAccess = onCall(options, async request => {
    const c=await context(request);
    return {...c.access,canPreview:c.canPreview};
  });

  const setFamilyPreviewPlan = onCall(options, async request => {
    const c=await context(request);
    if (!c.canPreview) throw new HttpsError('permission-denied','試用切替は家族のオーナーのみ利用できます');
    const previewPlan=request.data?.plan;
    if (!['free','premium'].includes(previewPlan)) throw new HttpsError('invalid-argument','プランが不正です');
    await c.ref.set({previewPlan,features:accessFor({previewPlan},true).features,previewUpdatedAt:Date.now(),previewUpdatedBy:c.uid},{merge:true});
    return {...accessFor({previewPlan},true),canPreview:true};
  });

  const getDailySummaryEmailSettings = onCall(options, async request => {
    const c = await context(request);
    const settings = await c.root.collection('services').doc('dailySummaryEmail').get();
    const recipients = await familyEmails(c.root);
    return {
      enabled: Boolean(settings.data()?.enabled),
      hourJst: Number.isInteger(settings.data()?.hourJst) ? settings.data().hourJst : 21,
      recipients,
      canEdit: c.canPreview,
    };
  });

  const setDailySummaryEmailSettings = onCall(options, async request => {
    const c = await context(request);
    if (!c.canPreview) throw new HttpsError('permission-denied','日次まとめメールは家族のオーナーが設定してください');
    const enabled = request.data?.enabled === true;
    const hourJst = Number(request.data?.hourJst);
    if (!Number.isInteger(hourJst) || hourJst < 0 || hourJst > 23) throw new HttpsError('invalid-argument','送信時刻を確認してください');
    if (enabled && !c.access.features.dailySummaryEmail) throw new HttpsError('permission-denied','日次まとめメールは有料限定です');
    await c.root.collection('services').doc('dailySummaryEmail').set({
      enabled,
      hourJst,
      updatedAt:admin.firestore.FieldValue.serverTimestamp(),
      updatedBy:c.uid,
    },{merge:true});
    return { enabled, hourJst, recipients:await familyEmails(c.root), canEdit:true };
  });

  const twinlyAi = onCall({...options,secrets:[key]},async request => {
    const c=await context(request);
    const mode=request.data?.mode;
    const feature=mode==='review'?'aiReview':mode==='ask'?'aiChat':null;
    if (!feature) throw new HttpsError('invalid-argument','操作が不正です');
    if (!c.access.features[feature]) throw new HttpsError('permission-denied','無料モードではAI機能を利用できません');
    const state=await c.root.collection('app').doc('state').get();
    const app=state.data()?.app;
    if (!app || state.data()?.migrationState==='copying') throw new HttpsError('failed-precondition','記録の読み込み・移行が完了してからお試しください');
    const now=Date.now();
    const day=jstDate(now);
    const cache=c.root.collection('aiReviews').doc(day);
    const cached=await cache.get();
    const cachedData=cached.exists?cached.data():null;

    if(mode==='ask') {
      const question=String(request.data?.question||'').trim();
      if(!question || question.length>500) throw new HttpsError('invalid-argument','質問は1〜500文字で入力してください');
      if(cachedData?.version!==REVIEW_VERSION || !Array.isArray(cachedData.summary)) throw new HttpsError('failed-precondition','先に今日のAIアドバイスを表示してください');
      const deep=needsTimeline(question);
      let timeline;
      if(deep) {
        const events=await loadEvents(c.root,state,now-15*DAY,now+60000,1001);
        timeline=compactTimeline(events,now);
      }
      const reservation=await reserve(c,feature);
      const result=await generate(
        'Twinlyに記録された双子育児データについて、日本語で簡潔に質問へ答える。JSON {answer:string} のみ返す。まず今日のAIアドバイスと集計済みcontextを根拠にする。timelineが渡された場合だけ追加の時系列確認に使う。データにないことは推測せず「記録からは判断できません」と明示する。A/Bではなく登録名を使う。医療診断、投薬、治療指示、具体的な授乳量変更の指示はしない。心配な症状の相談では記録を持って小児科・保健師へ相談する案内に留める。',
        {
          question,
          review:{observations:cachedData.observations,checks:cachedData.checks,generatedAt:cachedData.generatedAt},
          context:compactChatContext(cachedData.summary,question),
          ...(timeline?{timeline}:{}),
        }
      );
      if(typeof result.answer!=='string' || !result.answer.trim() || result.answer.length>1600) throw new HttpsError('data-loss','AI回答の形式が不正です');
      const latest=await context(request);
      if(!latest.access.features.aiChat) throw new HttpsError('permission-denied','無料モードへ切り替わりました');
      await commitUsage(c,reservation);
      return {answer:replaceBabyLabels(result.answer,cachedData.summary),source:deep?'review+timeline':'review',generatedAt:now};
    }

    if(cachedData?.version===REVIEW_VERSION && Array.isArray(cachedData.summary)) return publicReview(cachedData);
    const events=await loadEvents(c.root,state,now-16*DAY,now+60000,3001);
    const summary=summarize(events,now,app.profiles||{});
    if(!summary.some(b=>b.periods.some(p=>(p.recordCount||0)>0))) throw new HttpsError('failed-precondition','AIアドバイスには直近2週間の育児記録が必要です');
    const reservation=await reserve(c,feature,{allowReviewRefresh:Boolean(cachedData&&cachedData.version!==REVIEW_VERSION)});
    const result=await generate(
      '双子育児の直近2週間の記録から、家族が今日確認すると役立つ短いアドバイスを日本語で作る。JSON {observations:string,checks:string} のみ返す。observationsは「最近の傾向」、checksは「今日のポイント」として各800文字以内。入力の各babyにはnameがあるので、回答では必ずその登録名を使い、A・B・赤ちゃんA・赤ちゃんBという呼び方は絶対に使わない。2人を比較する時も登録名で書く。ミルクの量と回数、おむつ交換・おしっこ・うんち、離乳食、総睡眠と夜間睡眠、睡眠回数、体重（十分な測定がある場合のみ）、日ごとの変化、双子同士の差、メモ、就寝前2時間以内のミルク記録を総合して見る。直近7日とその前7日の変化を優先し、急な増減や継続する傾向を簡潔に示す。todaySoFarは今日の途中経過なので完了した1日と同列に比較しない。メモに吐き戻し等が繰り返しあれば一般的な確認事項を提案してよいが原因を断定しない。月齢の一般的な目安は補助的に使ってよいが個人差が大きいことを前提とし、厳密な正常・異常判定や診断はしない。記録がない日はゼロとみなさない。数値の羅列ではなく、変化・比較・次に見るポイントを優先する。治療、投薬、メーカー変更、具体的な授乳量の増減を指示しない。心配な変化は記録を持って小児科や保健師へ相談するよう案内する。',
      summary
    );
    if(typeof result.observations!=='string'||typeof result.checks!=='string'||result.observations.length>1200||result.checks.length>1200) throw new HttpsError('data-loss','AIアドバイスの形式が不正です');
    const latest=await context(request);
    if(!latest.access.features.aiReview) throw new HttpsError('permission-denied','無料モードへ切り替わりました');
    const review={
      version:REVIEW_VERSION,
      observations:replaceBabyLabels(result.observations,summary),
      checks:replaceBabyLabels(result.checks,summary),
      generatedAt:now,
      summary,
    };
    await commitUsage(c,reservation);
    await cache.set(review);
    return publicReview(review);
  });

  const sendDailySummaryEmails = onSchedule(
    {schedule:'every 60 minutes',timeZone:'Asia/Tokyo',region:'asia-northeast1',maxInstances:1},
    async () => {
      const now=Date.now();
      const hour=jstHour(now);
      const day=jstDate(now);
      const settingsRows=await db.collectionGroup('services').where('enabled','==',true).get();
      for(const settingsSnap of settingsRows.docs) {
        if(settingsSnap.id!=='dailySummaryEmail' || settingsSnap.data()?.hourJst!==hour || settingsSnap.data()?.lastQueuedDate===day) continue;
        const root=settingsSnap.ref.parent.parent;
        if(!root) continue;
        try {
          const accessSnap=await root.collection('services').doc('access').get();
          if(!accessFor(accessSnap.data(),true).features.dailySummaryEmail) continue;
          const state=await root.collection('app').doc('state').get();
          const app=state.data()?.app;
          if(!app || state.data()?.migrationState==='copying') continue;
          const from=Math.floor((now+JST)/DAY)*DAY-JST-DAY;
          const events=await loadEvents(root,state,from,now+60000,1501);
          const summary=buildDailySummary(events,now,app.profiles||{});
          const recipients=await familyEmails(root);
          if(!recipients.length) continue;
          const message=formatDailySummaryMail(summary);
          const mailRef=db.collection('mail').doc();
          await db.runTransaction(async tx => {
            const latestSettings=await tx.get(settingsSnap.ref);
            if(latestSettings.data()?.lastQueuedDate===day || latestSettings.data()?.enabled!==true) return;
            tx.create(mailRef,{to:recipients,message,createdAt:admin.firestore.FieldValue.serverTimestamp(),familyId:root.id,kind:'dailySummary'});
            tx.set(settingsSnap.ref,{lastQueuedDate:day,lastQueuedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
          });
        } catch(error) {
          console.error('Daily summary email queue failed',{familyId:root.id,message:error?.message});
        }
      }
    }
  );

  return {
    getFamilyAccess,
    setFamilyPreviewPlan,
    getDailySummaryEmailSettings,
    setDailySummaryEmailSettings,
    twinlyAi,
    sendDailySummaryEmails,
  };
};
