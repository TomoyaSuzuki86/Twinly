const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const factory=require('../ai-service');
const {summarize}=require('../ai-policy');
const originalFetch=global.fetch;

afterEach(()=>{global.fetch=originalFetch;delete process.env.TWINLY_AI_API_KEY;});

function setup(extra={}) {
  const docs=new Map(Object.entries({
    'users/u':{activeFamilyId:'f'},
    'families/f/members/u':{status:'active',role:'owner'},
    'families/f/app/state':{app:{profiles:{A:{displayName:'奏汰',birthDate:'2026-04-02'},B:{displayName:'日向',birthDate:'2026-04-02'}},events:[]}},
    ...extra
  }));
  const ref=path=>({
    path,
    collection:name=>ref(`${path}/${name}`),
    doc:id=>ref(`${path}/${id}`),
    get:async()=>({exists:docs.has(path),data:()=>docs.get(path)}),
    set:async(data,options)=>docs.set(path,options?.merge?{...docs.get(path),...data}:data),
  });
  const db={
    doc:ref,
    collection:ref,
    collectionGroup:()=>({where:()=>({get:async()=>({docs:[]})})}),
    runTransaction:async fn=>fn({
      get:r=>r.get(),
      set:(r,d,options)=>docs.set(r.path,options?.merge?{...docs.get(r.path),...d}:d),
      create:(r,d)=>docs.set(r.path,d),
    }),
  };
  return {services:factory(db),docs};
}

const request=data=>({auth:{uid:'u'},data});
const geminiJson=payload=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(payload)}]}}]})});

function reviewState(now=Date.now()) {
  return {app:{profiles:{A:{displayName:'奏汰',birthDate:'2026-04-02'},B:{displayName:'日向',birthDate:'2026-04-02'}},events:[
    {babyId:'A',type:'milk',milkMl:180,timestamp:now-2*86400000},
    {babyId:'B',type:'diaper',diaperKind:'pee',timestamp:now-2*86400000+60000},
    {babyId:'A',type:'daily',note:'吐き戻しあり',timestamp:now-2*86400000+120000},
  ]}};
}

function cachedReview(now=Date.now()) {
  const state=reviewState(now);
  return {
    version:3,
    observations:'奏汰と日向の最近の傾向です。',
    checks:'今日も睡眠を確認してください。',
    generatedAt:now,
    summary:summarize(state.app.events,now,state.app.profiles),
  };
}

test('unauthenticated and inactive members are rejected',async()=>{
  const {services}=setup({'families/f/members/u':{status:'inactive',role:'owner'}});
  await assert.rejects(services.getFamilyAccess.run({}),e=>e.code==='unauthenticated');
  await assert.rejects(services.getFamilyAccess.run(request({})),e=>e.code==='permission-denied');
});

test('only the active family owner can change preview, never the billing plan',async()=>{
  const {services,docs}=setup({'families/f/services/access':{plan:'free'}});
  await services.setFamilyPreviewPlan.run(request({plan:'premium'}));
  assert.equal(docs.get('families/f/services/access').plan,'free');
  assert.equal((await services.getFamilyAccess.run(request({}))).features.aiChat,true);
  assert.equal((await services.getFamilyAccess.run(request({}))).features.dailySummaryEmail,true);
  docs.set('families/f/members/u',{status:'active',role:'member'});
  await assert.rejects(services.setFamilyPreviewPlan.run(request({plan:'free'})),e=>e.code==='permission-denied');
});

test('direct AI calls in free mode never contact provider',async()=>{
  global.fetch=()=>{throw new Error('must not call provider');};
  const {services}=setup();
  await assert.rejects(services.twinlyAi.run(request({mode:'review'})),e=>e.code==='permission-denied');
});

test('provider configuration errors do not consume successful quota',async()=>{
  process.env.TWINLY_AI_API_KEY='test-only';
  const now=Date.now(),day=new Date(now+9*3600000).toISOString().slice(0,10),month=day.slice(0,7);
  const {services,docs}=setup({'families/f/services/access':{plan:'premium'},'families/f/app/state':reviewState(now)});
  global.fetch=async()=>({ok:false,status:400,text:async()=>'{"error":"bad config"}'});
  await assert.rejects(services.twinlyAi.run(request({mode:'review'})),e=>e.code==='failed-precondition'&&e.message.includes('送信設定'));
  assert.equal(docs.get(`families/f/aiUsage/${day}`).successfulCount||0,0);
  assert.equal(docs.get(`families/f/aiUsage/${month}`)?.successfulCount||0,0);
});

test('review caches summary context but returns only public advice',async()=>{
  process.env.TWINLY_AI_API_KEY='test-only';
  const now=Date.now(),day=new Date(now+9*3600000).toISOString().slice(0,10);
  const {services,docs}=setup({'families/f/services/access':{plan:'premium'},'families/f/app/state':reviewState(now)});
  global.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
    const payload=JSON.parse(body.contents[0].parts[0].text);
    assert.equal(payload[0].name,'奏汰');
    assert.equal(payload[1].name,'日向');
    return geminiJson({observations:'Aはミルク、Bはおむつの記録があります。',checks:'赤ちゃんAのメモを確認してください。'});
  };
  const result=await services.twinlyAi.run(request({mode:'review'}));
  assert.match(result.observations,/奏汰/);
  assert.match(result.observations,/日向/);
  assert.equal('summary' in result,false);
  assert.equal(docs.get(`families/f/aiReviews/${day}`).version,3);
  assert.equal(Array.isArray(docs.get(`families/f/aiReviews/${day}`).summary),true);
});

test('review uses current daily cache without another provider call',async()=>{
  const now=Date.now(),day=new Date(now+9*3600000).toISOString().slice(0,10);
  const {services}=setup({'families/f/services/access':{plan:'premium'},[`families/f/aiReviews/${day}`]:cachedReview(now)});
  global.fetch=()=>{throw new Error('must not call provider');};
  assert.equal((await services.twinlyAi.run(request({mode:'review'}))).observations,'奏汰と日向の最近の傾向です。');
});

test('AI question requires today review cache',async()=>{
  const {services}=setup({'families/f/services/access':{plan:'premium'}});
  await assert.rejects(services.twinlyAi.run(request({mode:'ask',question:'最近どう？'})),e=>e.code==='failed-precondition'&&e.message.includes('先に今日のAIアドバイス'));
});

test('high-level AI question uses cached review context without timeline',async()=>{
  process.env.TWINLY_AI_API_KEY='test-only';
  const now=Date.now(),day=new Date(now+9*3600000).toISOString().slice(0,10);
  const {services}=setup({'families/f/services/access':{plan:'premium'},[`families/f/aiReviews/${day}`]:cachedReview(now)});
  global.fetch=async(_url,options)=>{
    const payload=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.equal(payload.question,'最近、睡眠は減ってる？');
    assert.equal('timeline' in payload,false);
    assert.equal(payload.context[0].name,'奏汰');
    return geminiJson({answer:'直近の集計では大きな変化は確認できません。'});
  };
  const result=await services.twinlyAi.run(request({mode:'ask',question:'最近、睡眠は減ってる？'}));
  assert.equal(result.source,'review');
  assert.match(result.answer,/大きな変化/);
});

test('timing AI question adds a bounded timeline only when needed',async()=>{
  process.env.TWINLY_AI_API_KEY='test-only';
  const now=Date.now(),day=new Date(now+9*3600000).toISOString().slice(0,10);
  const state=reviewState(now);
  state.app.events.push({babyId:'A',type:'sleepStart',timestamp:now-3600000},{babyId:'A',type:'milk',milkMl:180,timestamp:now-5400000});
  const {services}=setup({'families/f/services/access':{plan:'premium'},'families/f/app/state':state,[`families/f/aiReviews/${day}`]:cachedReview(now)});
  global.fetch=async(_url,options)=>{
    const payload=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.equal(Array.isArray(payload.timeline),true);
    assert.equal(payload.timeline.length<=200,true);
    return geminiJson({answer:'寝る前のミルク記録を追加確認しました。'});
  };
  const result=await services.twinlyAi.run(request({mode:'ask',question:'寝る前のミルクのタイミングは？'}));
  assert.equal(result.source,'review+timeline');
});
