const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stockAlerts}=require('../stock-alerts');
test('shared size counts both babies once and requires enough data',()=>{
  const now=Date.now(),app={diaperStockManagementEnabled:true,profiles:{A:{diaperSize:'M',diaperStockBySize:{M:2}},B:{diaperSize:'M',diaperStockBySize:{M:2}}},events:[]};
  assert.deepEqual(stockAlerts(app,now),[]);
  app.events=Array.from({length:7},(_,i)=>({type:'diaper',babyId:i%2?'A':'B',timestamp:now-i*1000}));
  assert.deepEqual(stockAlerts(app,now),[{size:'M',remaining:2,daysRemaining:2}]);
  assert.deepEqual(stockAlerts({...app,diaperStockManagementEnabled:false},now),[]);
});
