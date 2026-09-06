function stockAlerts(app, now) {
  if (!app.diaperStockManagementEnabled) return [];
  const profiles=Object.values(app.profiles||{});
  return [...new Set(profiles.map(p=>p.diaperSize).filter(Boolean))].flatMap(size=>{
    const remaining=profiles.find(p=>Object.hasOwn(p.diaperStockBySize||{},size))?.diaperStockBySize[size];
    if(!Number.isFinite(remaining))return [];
    const babyIds=Object.entries(app.profiles).filter(([,p])=>p.diaperSize===size).map(([id])=>id);
    const count=(app.events||[]).filter(e=>e.type==='diaper'&&babyIds.includes(e.babyId)&&e.timestamp>=now-7*86400000&&e.timestamp<=now).length;
    if(remaining>0&&count<3)return [];
    const daysRemaining=remaining<=0?0:remaining/(count/7);
    return daysRemaining<=3?[{size,remaining,daysRemaining}]:[];
  });
}
module.exports={stockAlerts};
