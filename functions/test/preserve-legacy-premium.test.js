const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preserve}=require('../preserve-legacy-premium');
function fixture({users=[{uid:'u1',displayName:'cat rabbit'}], premium=true, member=true, marker=false, grant=false}={}) {
 const docs=new Map([
 ['users/u1',{activeFamilyId:'f1'}],
 ['families/f1/members/u1',{status:member?'active':'inactive'}],
 ['families/f1/services/access',{previewPlan:premium?'premium':'free',...(grant?{premiumGrant:'legacy'}:{})}],
 ]);
 if(marker) docs.set('adminMigrations/preserveRabbitCatPremiumV1',{familyId:'f1'});
 const snap=path=>({exists:docs.has(path),data:()=>docs.get(path)});
 const writes=[];
 const db={doc:path=>({path,get:async()=>snap(path)}),runTransaction:async fn=>fn({
 get:async ref=>snap(ref.path),
 set:(ref,value)=>{writes.push(ref.path);docs.set(ref.path,{...docs.get(ref.path),...value});},
 create:(ref,value)=>{writes.push(ref.path);docs.set(ref.path,value);},
 })};
 return {db,auth:{listUsers:async()=>({users})},docs,writes};
}
test('preserves only the existing target family and remains idempotent',async()=>{
 const f=fixture();await preserve(f.auth,f.db);
 assert.equal(f.docs.get('families/f1/services/access').premiumGrant,'legacy');
 assert.equal(f.writes.length,2);
 await preserve(f.auth,f.db); assert.equal(f.writes.length,2);
});
test('refuses ambiguous, missing, inactive or non-premium targets without writes',async()=>{
 for(const options of [{users:[]},{users:[{uid:'u1',displayName:'cat rabbit'},{uid:'u2',displayName:'rabbit cat'}]},{premium:false},{member:false}]) {
  const f=fixture(options);await assert.rejects(()=>preserve(f.auth,f.db));assert.equal(f.writes.length,0);
 }
});
test('does not silently regrant a manually removed entitlement',async()=>{
 const f=fixture({marker:true});await assert.rejects(()=>preserve(f.auth,f.db));assert.equal(f.writes.length,0);
});
