const {test}=require('node:test');
const assert=require('node:assert/strict');
const {accessFor,validateDrafts,summarize}=require('../ai-policy');
test('default is free; preview is ignored outside allowed family',()=>{
  assert.equal(Object.values(accessFor({previewPlan:'free'},true).features).every(v=>v===false),true);
  assert.equal(Object.values(accessFor({previewPlan:'premium'},true).features).every(v=>v===true),true);
  assert.equal(accessFor().features.aiVoice,false);
  assert.equal(accessFor({previewPlan:'premium'},false).features.aiVoice,false);
  assert.equal(accessFor({previewPlan:'premium'},true).features.aiVoice,true);
  assert.equal(accessFor({plan:'premium',previewPlan:'free'},true).features.aiReview,false);
  assert.equal(accessFor({plan:'premium',previewPlan:'free'},false).features.aiReview,true);
});
test('voice keeps per-baby amounts, relative times and ambiguous time',()=>{
  const now=Date.now();
  const result=validateDrafts([{babyId:'A',type:'milk',timestamp:now,milkMl:70},{babyId:'B',type:'milk',timestamp:now-15*60000,milkMl:20},{babyId:'B',type:'diaper',timestamp:null,diaperKind:'pee',clarification:'その後の時刻を確認'}],now);
  assert.deepEqual(result.map(e=>[e.babyId,e.milkMl,e.timestamp]),[['A',70,now],['B',20,now-900000],['B',undefined,null]]);
});
test('untrusted output is bounded and cannot smuggle fields into saved events',()=>{
  const now=Date.now();
  for(const patch of [{babyId:'C'},{milkMl:-1},{milkMl:5000},{timestamp:now+999999},{timestamp:undefined},{type:'admin'}])
    assert.throws(()=>validateDrafts([{babyId:'A',type:'milk',milkMl:70,timestamp:now,...patch}],now));
  assert.equal(validateDrafts([{babyId:'A',type:'milk',milkMl:70,timestamp:now,createdByUid:'other'}],now)[0].createdByUid,undefined);
});
test('weekly comparison excludes partial today and reports missing days',()=>{
  const now=Date.parse('2026-09-05T12:00:00+09:00');
  const events=[{babyId:'A',type:'milk',milkMl:100,timestamp:Date.parse('2026-09-04T23:59:00+09:00')},{babyId:'A',type:'milk',milkMl:900,timestamp:Date.parse('2026-09-05T00:00:00+09:00')}];
  const result=summarize(events,now)[0].periods[1];
  assert.equal(result.milkMl,100);assert.equal(result.daysWithMilkRecords,1);
});
test('review summary uses registered names and combines feeding, diaper, sleep and notes',()=>{
  const now=Date.parse('2026-09-05T12:00:00+09:00');
  const sleepStart=Date.parse('2026-09-03T22:00:00+09:00'), wake=Date.parse('2026-09-04T06:00:00+09:00');
  const events=[
    {babyId:'A',type:'milk',milkMl:180,timestamp:sleepStart-30*60000},
    {babyId:'A',type:'sleepStart',timestamp:sleepStart},
    {babyId:'A',type:'wake',timestamp:wake},
    {babyId:'A',type:'diaper',diaperKind:'mix',timestamp:Date.parse('2026-09-04T08:00:00+09:00')},
    {babyId:'A',type:'solidFood',timestamp:Date.parse('2026-09-04T10:00:00+09:00')},
    {babyId:'A',type:'daily',note:'少し吐き戻しあり',timestamp:Date.parse('2026-09-04T11:00:00+09:00')},
    {babyId:'A',type:'weight',weight:7.8,timestamp:Date.parse('2026-09-04T12:00:00+09:00')},
  ];
  const [result]=summarize(events,now,{A:{displayName:'奏汰',birthDate:'2026-04-02'},B:{displayName:'日向',birthDate:'2026-04-02'}});
  const recent=result.periods[1];
  assert.equal(result.name,'奏汰');
  assert.equal(result.birthDate,'2026-04-02');
  assert.equal(recent.milkMl,180);
  assert.equal(recent.diaperChanges,1);
  assert.equal(recent.peeCount,1);
  assert.equal(recent.poopCount,1);
  assert.equal(recent.solidFoodCount,1);
  assert.equal(recent.sleepMinutes,480);
  assert.equal(recent.nightSleepMinutes,480);
  assert.equal(result.notes[0].text,'少し吐き戻しあり');
  assert.equal(result.bedtimeFeeds[0].milkMl,180);
  assert.equal(result.bedtimeFeeds[0].minutesBefore,30);
});
