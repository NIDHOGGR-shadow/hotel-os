'use strict';
(()=>{
  const form=document.getElementById('dailyDateForm'),input=document.getElementById('dailyDate');
  if(!form||!input)return;
  const target=document.getElementById('dailyResults');
  let requestIndex=0,loadedDay=null,loadedAt=0,timeZone='Africa/Lagos';
  const today=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=type=>parts.find(p=>p.type===type)?.value;return part('year')+'-'+part('month')+'-'+part('day');};
  const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>='2000-01-01'&&day<='2100-12-31'&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
  const quantity=value=>new Intl.NumberFormat('en-NG',{maximumFractionDigits:3}).format(Number(value));
  const clear=()=>{requestIndex++;loadedDay=null;target.hidden=true;['dailyMetrics','dailyRooms','dailyFood','dailyStock'].forEach(id=>el(id).replaceChildren());msg('dailyStatus','');};
  function table(rootId,headers,rows,label){
    const root=el(rootId);root.replaceChildren();
    if(!rows.length){root.append(node('p',label,'helper'));root.removeAttribute('tabindex');return;}
    root.tabIndex=0;root.setAttribute('role','region');root.setAttribute('aria-label',label);
    const table=node('table',undefined,'daily-table'),head=node('thead'),heading=node('tr'),body=node('tbody');
    headers.forEach(title=>{const th=node('th',title);th.scope='col';heading.append(th);});head.append(heading);
    rows.forEach(values=>{const tr=node('tr');values.forEach((value,index)=>{const cell=node(index===0?'th':'td',String(value));if(index===0)cell.scope='row';tr.append(cell);});body.append(tr);});
    table.append(head,body);root.append(table);
  }
  function render(data){
    timeZone=data.timeZone||timeZone;
    const currency=/^[A-Z]{3}$/.test(data.currency)?data.currency:'NGN';
    const price=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value)/100);
    const room=data.roomSummary,pay=data.payments,food=data.foodSummary;
    el('dailyMetrics').replaceChildren(metric('Available rooms',String(room.available)),metric('Reserved rooms',String(room.reserved)),metric('Payment holds',String(room.held)),metric('Room charges for this night',price(room.nightlyChargesMinor)),metric('Verified receipts · gross',price(pay.receiptsMinor)),metric('Food sales recorded',price(food.totalMinor)));
    el('dailyContext').textContent=new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'}).format(new Date(data.day+'T12:00:00Z'))+' · '+timeZone+' · '+room.arrivals+' arrivals · '+room.departures+' departures · '+room.total+' total rooms · '+room.unpublished+' unpublished';
    table('dailyRooms',['Room','Category','Booking','Housekeeping'],data.rooms.map(item=>[item.number,item.category,({available:'Available',reserved:'Reserved',held:'Payment hold',unpublished:'Not published'})[item.status]||item.status,item.condition]),'Room availability and housekeeping');
    table('dailyFood',['Menu item','Servings','Orders','Sales'],data.food.map(item=>[item.name,quantity(item.servings),String(item.orders),price(item.totalMinor)]),'No finalized food sales for this day.');
    table('dailyStock',['Item','Unit','Opening','Received','Food use','Waste','Other changes','Closing'],data.stock.map(item=>[item.name+(item.active&&item.lowStock?' · low stock':''),item.unit,quantity(item.opening),quantity(item.received),quantity(item.foodUsed),quantity(item.waste),quantity(item.adjustments),quantity(item.closing)]),'No stock items have been recorded.');
    const notes=[pay.verifiedCount+' verified receipt'+(pay.verifiedCount===1?'':'s')+'; '+food.finalizedOrders+' finalized food order'+(food.finalizedOrders===1?'':'s')+'. Room charges follow stay nights; receipts follow payment dates.'];
    if(food.openOrders)notes.push(food.openOrders+' food orders remain open.');
    if(pay.unverifiedCount)notes.push(pay.unverifiedCount+' payment records are unverified or failed.');
    if(pay.otherCurrencyCount)notes.push(pay.otherCurrencyCount+' receipts use another currency and are excluded from the '+currency+' total.');
    if(!food.menuItems)notes.push('No menu items have been recorded.');
    msg('dailyStatus',notes.join(' '),!pay.unverifiedCount&&!pay.otherCurrencyCount);
    target.hidden=false;
  }
  async function load(force=false){
    if(!['owner','manager'].includes(currentRole)||!session)return;
    if(!input.value)input.value=today();
    const day=input.value;
    if(!validDay(day)){msg('dailyStatus','Choose a valid date between 2000 and 2100.');return;}
    if(!force&&day===loadedDay&&Date.now()-loadedAt<15000)return;
    const index=++requestIndex,user=identity?.id;
    target.hidden=true;msg('dailyStatus','Loading daily records…',true);
    const controls=[...form.querySelectorAll('input,button')];controls.forEach(control=>control.disabled=true);
    try{
      const response=await operations('daily_reconciliation',{p_property:config.propertyId,p_day:day});
      if(index!==requestIndex||!session||identity?.id!==user||!['owner','manager'].includes(currentRole))return;
      const data=response.data;
      if(!data||data.day!==day||!Array.isArray(data.rooms)||!Array.isArray(data.food)||!Array.isArray(data.stock)||!data.roomSummary||!data.payments||!data.foodSummary)throw Error('Daily records are temporarily unavailable.');
      render(data);loadedDay=day;loadedAt=Date.now();
    }catch(error){if(index===requestIndex&&session)msg('dailyStatus',error.message||'Could not load daily records.');}
    finally{controls.forEach(control=>control.disabled=false);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())void load(true);});
  function move(days){
    const base=validDay(input.value)?input.value:today();
    const date=new Date(base+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);
    const next=date.toISOString().slice(0,10);if(!validDay(next))return;
    input.value=next;void load(true);
  }
  el('dailyPrevious').addEventListener('click',()=>move(-1));el('dailyNext').addEventListener('click',()=>move(1));
  window.HotelDailyRecords=Object.freeze({load,clear});
})();
