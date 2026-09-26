const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { accessFor, summarize } = require('./ai-policy');
const { isActiveMember, isFamilyOwner } = require('./access-policy');
const { generateGeminiJson } = require('./gemini-json-client');
const { createAiUsage } = require('./ai-usage');

const key = defineSecret('TWINLY_AI_API_KEY');
const model = defineString('TWINLY_AI_MODEL', { default: 'gemini-3.6-flash' });
const fallbackModel = defineString('TWINLY_AI_FALLBACK_MODEL', { default: 'gemini-3.5-flash-lite' });
const options = { region: 'asia-northeast1', maxInstances: 1, timeoutSeconds: 60, invoker: 'public' };
const REVIEW_VERSION = 3;
const DAY = 86400000;
const JST = 9 * 3600000;

function replaceBabyLabels(text, summary) {
  let value = String(text);
  const replacements = [];
  summary.forEach((baby, index) => {
    const id = String(baby.babyId || '').toUpperCase();
    const name = baby.name || id;
    const token = `__TWINLY_CHILD_${index}__`;
    value = value.replace(new RegExp(`赤ちゃん${id}`, 'gi'), token);
    value = value.replace(new RegExp(`(^|[^A-Za-z0-9])${id}(?=[^A-Za-z0-9]|$)`, 'gi'), (_match, prefix) => `${prefix}${token}`);
    replacements.push([token, name]);
  });
  for (const [token, name] of replacements) value = value.replaceAll(token, name);
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

module.exports = function createAiServices(db) {
  async function context(request, accessDocId = 'access') {
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
    if (!isActiveMember(member.data())) throw new HttpsError('permission-denied','家族へのアクセス権がありません');
    const ref = root.collection('services').doc(accessDocId);
    let snap = await ref.get();
    if (process.env.TWINLY_BILLING_ENABLED === 'true' && snap.data()?.billingVersion !== 1) {
      await ref.set({ billingVersion: 1 }, { merge: true });
      snap = await ref.get();
    }
    const isOwner = isFamilyOwner(member.data(), family.data(), uid);
    return { root, ref, uid, access: accessFor(snap.data(),true), canPreview: isOwner };
  }

  async function generate(system, data) {
    return generateGeminiJson({
      system,
      data,
      apiKey: key.value(),
      primaryModel: model.value() || 'gemini-3.6-flash',
      secondaryModel: fallbackModel.value() || 'gemini-3.5-flash-lite',
    });
  }

  const aiUsage = createAiUsage({ db, accessFor });

  async function loadEvents(root, state, from, to, limit=3001) {
    const app = state.data()?.app;
    if (state.data()?.schemaVersion === 2) {
      const rows = await root.collection('events').where('timestamp','>=',from).where('timestamp','<=',to).orderBy('timestamp').limit(limit).get();
      if(rows.size >= limit) throw new HttpsError('resource-exhausted','対象期間の記録が多すぎます');
      return rows.docs.map(doc => doc.data());
    }
    return (app?.events || []).filter(event => Number.isFinite(event.timestamp) && event.timestamp >= from && event.timestamp <= to);
  }

  const getFamilyAccess = onCall(options, async request => {
    const c=await context(request);
    return {...c.access,canPreview:c.canPreview};
  });

  const setFamilyPreviewPlan = onCall(options, async request => {
    const c=await context(request);
    if (process.env.TWINLY_BILLING_ENABLED === 'true' || c.access.billing) throw new HttpsError('failed-precondition','料金とプランから無料体験・お支払いへ進んでください');
    if (!c.canPreview) throw new HttpsError('permission-denied','試用切替は家族のオーナーのみ利用できます');
    const previewPlan=request.data?.plan;
    if (!['free','premium'].includes(previewPlan)) throw new HttpsError('invalid-argument','プランが不正です');
    await c.ref.set({previewPlan,features:accessFor({previewPlan},true).features,previewUpdatedAt:Date.now(),previewUpdatedBy:c.uid},{merge:true});
    return {...accessFor({previewPlan},true),canPreview:true};
  });

  const createTwinlyAi = accessDocId => onCall({...options,secrets:[key]},async request => {
    const c=await context(request, accessDocId);
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
      const reservation=await aiUsage.reserve(c,feature);
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
      const latest=await context(request, accessDocId);
      if(!latest.access.features.aiChat) throw new HttpsError('permission-denied','無料モードへ切り替わりました');
      await aiUsage.commit(c,reservation);
      return {answer:replaceBabyLabels(result.answer,cachedData.summary),source:deep?'review+timeline':'review',generatedAt:now};
    }

    if(cachedData?.version===REVIEW_VERSION && Array.isArray(cachedData.summary)) return publicReview(cachedData);
    const events=await loadEvents(c.root,state,now-16*DAY,now+60000,3001);
    const summary=summarize(events,now,app.profiles||{});
    if(!summary.some(b=>b.periods.some(p=>(p.recordCount||0)>0))) throw new HttpsError('failed-precondition','AIアドバイスには直近2週間の育児記録が必要です');
    const reservation=await aiUsage.reserve(c,feature,{allowReviewRefresh:Boolean(cachedData&&cachedData.version!==REVIEW_VERSION)});
    const result=await generate(
      '双子育児の直近2週間の記録から、家族が今日確認すると役立つ短いアドバイスを日本語で作る。JSON {observations:string,checks:string} のみ返す。observationsは「最近の傾向」、checksは「今日のポイント」として各800文字以内。入力の各babyにはnameがあるので、回答では必ずその登録名を使い、A・B・赤ちゃんA・赤ちゃんBという呼び方は絶対に使わない。2人を比較する時も登録名で書く。ミルクの量と回数、おむつ交換・おしっこ・うんち、離乳食、総睡眠と夜間睡眠、睡眠回数、体重（十分な測定がある場合のみ）、日ごとの変化、双子同士の差、メモ、就寝前2時間以内のミルク記録を総合して見る。直近7日とその前7日の変化を優先し、急な増減や継続する傾向を簡潔に示す。todaySoFarは今日の途中経過なので完了した1日と同列に比較しない。メモに吐き戻し等が繰り返しあれば一般的な確認事項を提案してよいが原因を断定しない。月齢の一般的な目安は補助的に使ってよいが個人差が大きいことを前提とし、厳密な正常・異常判定や診断はしない。記録がない日はゼロとみなさない。数値の羅列ではなく、変化・比較・次に見るポイントを優先する。治療、投薬、メーカー変更、具体的な授乳量の増減を指示しない。心配な変化は記録を持って小児科や保健師へ相談するよう案内する。',
      summary
    );
    if(typeof result.observations!=='string'||typeof result.checks!=='string'||result.observations.length>1200||result.checks.length>1200) throw new HttpsError('data-loss','AIアドバイスの形式が不正です');
    const latest=await context(request, accessDocId);
    if(!latest.access.features.aiReview) throw new HttpsError('permission-denied','無料モードへ切り替わりました');
    const review={
      version:REVIEW_VERSION,
      observations:replaceBabyLabels(result.observations,summary),
      checks:replaceBabyLabels(result.checks,summary),
      generatedAt:now,
      summary,
    };
    await aiUsage.commit(c,reservation);
    await cache.set(review);
    return publicReview(review);
  });

  const twinlyAi = createTwinlyAi('access');
  const developmentTwinlyAi = createTwinlyAi('developmentAccess');

  return {
    getFamilyAccess,
    setFamilyPreviewPlan,
    twinlyAi,
    developmentTwinlyAi,
  };
};

