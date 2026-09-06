const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const factory=require('../ai-service');
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;delete process.env.TWINLY_TRIAL_FAMILY_ID;delete process.env.TWINLY_AI_API_KEY;});
function setup(extra={}) {
  const docs=new Map(Object.entries({
    'users/u':{activeFamilyId:'f'},
    'families/f/members/u':{status:'active',role:'owner'},
    'families/f/app/state':{app:{profiles:{A:{displayName:'奏汰'},B:{displayName:'日向'}},events:[]}},
    ...extra
  }));
  const ref=path=>({path,collection:name=>ref(`${path}/${name}`),doc:id=>ref(`${path}/${id}`),
    get:async()=>({exists:docs.has(path),data:()=>docs.get(path)}),
    set:async(data,options)=>docs.set(path,options?.merge?{...docs.get(path),...data}:data)});
  const db={doc:ref,collection:ref,runTransaction:async fn=>fn({get:r=>r.get(),set:(r,d)=>docs.set(r.path,d)})};
  return {services:factory(db),docs};
}
const request=data=>({auth:{uid:'u'},data});
test('unauthenticated and inactive members are rejected',async()=>{
  const {services}=setup({'families/f/members/u':{status:'inactive',role:'owner'}});
  await assert.rejects(services.getFamilyAccess.run({}),e=>e.code==='unauthenticated');
  await assert.rejects(services.getFamilyAccess.run(request({})),e=>e.code==='permission-denied');
});
test('only allowlisted family owner can change preview, never the billing plan',async()=>{
  process.env.TWINLY_TRIAL_FAMILY_ID='f';
  const {services,docs}=setup({'families/f/services/access':{plan:'free'}});
  await services.setFamilyPreviewPlan.run(request({plan:'premium'}));
  assert.equal(docs.get('families/f/services/access').plan,'free');
  assert.equal((await services.getFamilyAccess.run(request({}))).features.aiVoice,true);
  docs.set('families/f/members/u',{status:'active',role:'member'});
  await assert.rejects(services.setFamilyPreviewPlan.run(request({plan:'free'})),e=>e.code==='permission-denied');
  process.env.TWINLY_TRIAL_FAMILY_ID='other';
  assert.equal((await services.getFamilyAccess.run(request({}))).features.aiVoice,false);
});
test('direct AI calls in free mode never contact provider',async()=>{
  global.fetch=()=>{throw new Error('must not call provider');};
  const {services}=setup();
  await assert.rejects(services.twinlyAi.run(request({mode:'voice',text:'奏汰70',referenceTime:Date.now()})),e=>e.code==='permission-denied');
});
test('monthly quota rejects before provider and failed responses count',async()=>{
  const now=Date.now(),month=new Date(now+9*3600000).toISOString().slice(0,7);
  const {services,docs}=setup({'families/f/services/access':{plan:'premium'},[`families/f/aiUsage/${month}`]:{count:600}});
  let calls=0;global.fetch=async()=>{calls++;return {ok:false,status:429};};
  await assert.rejects(services.twinlyAi.run(request({mode:'voice',text:'奏汰70',referenceTime:now})),e=>e.code==='resource-exhausted');
  assert.equal(calls,0);
  docs.set(`families/f/aiUsage/${month}`,{count:0});process.env.TWINLY_AI_API_KEY='test-only';
  await assert.rejects(services.twinlyAi.run(request({mode:'voice',text:'奏汰70',referenceTime:now})),e=>e.code==='resource-exhausted');
  assert.equal(calls,1);assert.equal(docs.get(`families/f/aiUsage/${month}`).count,1);
});
test('successful parsing returns candidates without writing any events',async()=>{
  process.env.TWINLY_AI_API_KEY='test-only';
  const now=Date.now(),{services,docs}=setup({'families/f/services/access':{plan:'premium'}});
  global.fetch=async(_url,options)=>{
    assert.equal(options.headers['x-goog-api-key'],'test-only');
    return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({events:[{babyId:'B',type:'diaper',diaperKind:'pee',timestamp:null,clarification:'時刻を確認'}]})}]}}]})};
  };
  const result=await services.twinlyAi.run(request({mode:'voice',text:'日向、その後おしっこ',referenceTime:now}));
  assert.equal(result.events[0].timestamp,null);
  assert.equal([...docs.keys()].some(k=>k.includes('/events/')),false);
});
test('review uses daily cache without another provider call',async()=>{
  const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const {services}=setup({'families/f/services/access':{plan:'premium'},[`families/f/aiReviews/${day}`]:{observations:'cached',checks:'check'}});
  global.fetch=()=>{throw new Error('must not call provider');};
  assert.equal((await services.twinlyAi.run(request({mode:'review'}))).observations,'cached');
});
