'use strict';
// All rates and reservations are database records. No sample state is written to checkout.
const maybeEl=id=>document.getElementById(id);
const el=id=>{
  const element=maybeEl(id);
  if(!element)throw Error('The HOTEL staff page is missing #'+id+'. Refresh the page and try again.');
  return element;
};
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(n/100);
let config=null,session=null,identity=null,currentRole=null,roomTypes=[],rooms=[],reservations=[],guests=[];
const SESSION_KEY='hotel-os-staff-session';
const msg=(id,text,ok=false)=>{const node=el(id);node.textContent=text||'';node.style.color=ok?'#266447':'#923544'};
function announceRateUpdate(){try{localStorage.setItem('hotel-room-rate-revision',String(Date.now()));}catch{/* Other guests load the current rate from the server. */}}
function validPrice(value){
  if(value===''||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))return null;
  const n=Math.round(Number(value)*100);
  return Number.isSafeInteger(n)&&n>0?n:null;
}
async function jsonFetch(url,options={}){
  const r=await fetch(url,{cache:'no-store',...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||data.msg||data.error_description||'Request failed. Please try again.');
  return data;
}
function setSession(next){
  session=next;
  if(next)sessionStorage.setItem(SESSION_KEY,JSON.stringify(next));
  else sessionStorage.removeItem(SESSION_KEY);
}
async function refreshSession(){
  if(!session?.refresh_token)throw Error('Please sign in again.');
  const next=await jsonFetch(config.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{
    method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  if(!next.access_token||!next.refresh_token)throw Error('Please sign in again.');
  setSession({access_token:next.access_token,refresh_token:next.refresh_token,expiresAt:Date.now()+(next.expires_in||3600)*1000});
}
async function withToken(){
  if(!session?.access_token)throw Error('Please sign in.');
  if(Date.now()>session.expiresAt-60000)await refreshSession();
  return session.access_token;
}
async function operations(resourceOrAction,body){
  const token=await withToken();
  const post=body!==undefined;
  const url=post?'/api/operations?action='+encodeURIComponent(resourceOrAction):
    '/api/operations?'+new URLSearchParams({resource:resourceOrAction,property_id:config.propertyId,limit:'100'});
  return jsonFetch(url,{method:post?'POST':'GET',headers:{
    Authorization:'Bearer '+token,...(post?{'Content-Type':'application/json'}:{})
  },...(post?{body:JSON.stringify(body)}:{})});
}
async function validateStaff(){
  const token=await withToken();
  identity=await jsonFetch(config.supabaseUrl+'/auth/v1/user',{
    headers:{apikey:config.anonKey,Authorization:'Bearer '+token}
  });
  // Claim a preauthorized, one-time owner invitation only for a verified Auth email.
  // Supabase enforces the approved email, email confirmation and no-existing-owner checks.
  // This request cannot assign any role without the server-side invitation.
  try{
    await jsonFetch(config.supabaseUrl+'/rest/v1/rpc/hotel_claim_initial_owner',{
      method:'POST',
      headers:{
        apikey:config.anonKey,Authorization:'Bearer '+token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({p_property:config.propertyId})
    });
  }catch{
    // Normal staff login still works if there is no bootstrap invitation.
  }
  try{
    await jsonFetch(config.supabaseUrl+'/rest/v1/rpc/hotel_claim_staff_invite',{
      method:'POST',
      headers:{
        apikey:config.anonKey,Authorization:'Bearer '+token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({p_property:config.propertyId})
    });
  }catch{
    // Invited staff claim is optional for already-provisioned staff.
  }
  const result=await operations('staff_memberships');
  const mine=result.data?.find(x=>x.user_id===identity.id&&x.property_id===config.propertyId&&x.active);
  if(!mine)throw Error('This account has not been granted HOTEL access. Contact the HOTEL owner.');
  currentRole=mine.role;
  return currentRole;
}
function node(tag,text,cls){
  const n=document.createElement(tag);
  if(text!==undefined)n.textContent=text;
  if(cls)n.className=cls;
  return n;
}
function metric(label,value){
  const section=node('div',undefined,'metric');section.append(node('strong',value),node('span',label));return section;
}
function labelInput(title,value,type='text'){
  const label=node('label',title+' ');
  const input=document.createElement('input');input.type=type;input.value=String(value);label.append(input);
  return {label,input};
}
function renderRates(){
  const root=el('ratesList');root.replaceChildren();
  if(!roomTypes.length){root.append(node('p','No room categories yet. Create one below.','helper'));return;}
  for(const item of roomTypes){
    const card=node('div',undefined,'admin-record');
    const details=node('div');details.append(node('div',item.name,'name'),node('small','Capacity: '+item.capacity+' · Current: '+money(item.nightly_rate_minor)));
    const controls=node('div',undefined,'admin-controls');
    const {label,input}=labelInput('Price per night (₦)',(item.nightly_rate_minor/100).toFixed(2),'number');
    input.min='1';input.step='0.01';input.setAttribute('aria-label','Nightly rate for '+item.name);
    const save=node('button','Save rate','button');save.className='button';save.type='button';
    save.addEventListener('click',async()=>{
      const minor=validPrice(input.value);
      if(minor===null){msg('actionStatus','Enter a valid positive NGN price (up to 2 decimal places).');return;}
      save.disabled=true;msg('actionStatus','Saving '+item.name+' rate…');
      try{
        await operations('set_room_rate',{p_property:config.propertyId,p_room_type:item.id,p_rate_minor:minor});
        announceRateUpdate();
        await loadData();
        msg('actionStatus',item.name+' is now '+money(minor)+' per night for new reservations. The booking API will charge this rate.',true);
      }catch(e){msg('actionStatus',e.message);}finally{save.disabled=false;}
    });
    controls.append(label,save);card.append(details,controls);root.append(card);
  }
}
function renderInventory(){
  const root=el('physicalRooms');root.replaceChildren();
  if(!rooms.length){root.append(node('p','Add room numbers to make this category bookable.','helper'));}
  const types=new Map(roomTypes.map(t=>[t.id,t.name]));
  for(const item of rooms){
    const card=node('div',undefined,'admin-record');
    const label=node('div');label.append(node('div','Room '+item.room_number,'name'),node('small',(types.get(item.room_type_id)||'Unknown category')+' · '+(item.active?'Active':'Inactive')));
    const controls=node('div',undefined,'admin-controls');
    const select=document.createElement('select');select.setAttribute('aria-label','Room condition for '+item.room_number);
    for(const value of ['ready','dirty','cleaning','maintenance']){
      const option=document.createElement('option');option.value=value;option.textContent=value[0].toUpperCase()+value.slice(1);select.append(option);
    }
    select.value=item.condition;
    const save=node('button','Update status','button');save.className='button';save.type='button';
    save.addEventListener('click',async()=>{
      save.disabled=true;msg('actionStatus','Updating room '+item.room_number+'…');
      try{
        await operations('set_room_condition',{p_property:config.propertyId,p_room:item.id,p_condition:select.value});
        await loadData();msg('actionStatus','Room '+item.room_number+' updated.',true);
      }catch(e){msg('actionStatus',e.message);}finally{save.disabled=false;}
    });
    controls.append(select,save);card.append(label,controls);root.append(card);
  }
  const input=el('newRoomType');input.replaceChildren();
  for(const type of roomTypes){const option=document.createElement('option');option.value=type.id;option.textContent=type.name;input.append(option);}
}
const RESERVATION_STATES=Object.freeze({
  confirmed:'Confirmed',checked_in:'Checked in',checked_out:'Checked out',
  cancelled:'Cancelled',no_show:'No-show'
});
function renderReservations(){
  const root=el('reservationList'),stats=maybeEl('reservationStats');
  root.replaceChildren();
  if(stats){
    stats.replaceChildren();
    for(const [code,label] of Object.entries(RESERVATION_STATES)){
      stats.append(node('span',label+': '+reservations.filter(r=>r.status===code).length,'reservation-stat'));
    }
  }
  const types=new Map(roomTypes.map(r=>[r.id,r.name]));
  const people=new Map(guests.map(g=>[g.id,g]));
  const query=(maybeEl('reservationSearch')?.value||'').trim().toLowerCase();
  const filter=maybeEl('reservationStatusFilter')?.value||'all';
  const rows=reservations.filter(r=>{
    if(filter!=='all'&&r.status!==filter)return false;
    const person=people.get(r.guest_id);
    return !query||[r.id,r.status,r.check_in,r.check_out,types.get(r.room_type_id),person?.name,person?.email,person?.phone]
      .some(value=>String(value||'').toLowerCase().includes(query));
  });
  if(!rows.length){
    root.append(node('p',reservations.length?'No reservations match these filters.':'No reservations have been recorded yet.','helper'));
    return;
  }
  for(const item of rows){
    const person=people.get(item.guest_id);
    const card=node('article',undefined,'admin-record reservation-record');
    const summary=node('div',undefined,'reservation-summary');
    const heading=node('div',undefined,'reservation-heading');
    heading.append(node('strong',types.get(item.room_type_id)||'Reservation','name'),
      node('span',RESERVATION_STATES[item.status]||String(item.status),'reservation-badge status-'+item.status));
    summary.append(heading);
    summary.append(node('p',item.check_in+' → '+item.check_out+' · Ref '+String(item.id).slice(0,8),'reservation-meta'));
    if(person)summary.append(node('p',[person.name,person.email,person.phone].filter(Boolean).join(' · '),'reservation-contact'));
    summary.append(node('strong',Number.isSafeInteger(item.total_minor)?money(item.total_minor):'Amount unavailable','reservation-price'));
    card.append(summary);
    const controls=node('div',undefined,'reservation-controls');
    function statusButton(label,next){
      const button=node('button',label,'button outline');button.type='button';
      button.addEventListener('click',async()=>{
        if(!window.confirm('Confirm '+label.toLowerCase()+' for reservation '+String(item.id).slice(0,8)+'?'))return;
        button.disabled=true;msg('actionStatus','Updating reservation…',true);
        try{
          await operations('change_reservation',{p_property:config.propertyId,p_reservation:item.id,p_status:next});
          await loadData();msg('actionStatus','Reservation marked '+(RESERVATION_STATES[next]||next).toLowerCase()+'.',true);
          void window.HotelDailyRecords?.load(true);
        }catch(error){msg('actionStatus',error.message||'Could not update reservation.');}
        finally{button.disabled=false;}
      });
      controls.append(button);
    }
    if(item.status==='confirmed')statusButton('Check in','checked_in');
    if(item.status==='checked_in')statusButton('Check out','checked_out');
    if(item.status==='confirmed'){
      const close=node('details',undefined,'reservation-close'),title=node('summary','Close reservation (cancel / no-show)');
      const copy=node('p','Contact the guest first. Closing releases the room for other bookings, but does not initiate a refund or delete financial records.','helper');
      const label=node('label','Reason or contact outcome'),reason=node('textarea');
      reason.rows=2;reason.minLength=10;reason.maxLength=1000;reason.required=true;
      reason.placeholder='e.g. Called twice; guest confirmed they will not arrive.';
      label.append(reason);close.append(title,copy,label);
      const buttons=node('div',undefined,'admin-actions'),status=node('p','','form-message');
      status.setAttribute('role','status');
      for(const [next,labelText] of [['cancelled','Cancel reservation'],['no_show','Mark no-show']]){
        if(next==='no_show'&&item.check_in>new Date().toLocaleDateString('sv-SE',{timeZone:'Africa/Lagos'}))continue;
        const btn=node('button',labelText,next==='cancelled'?'button outline':'button');btn.type='button';
        btn.addEventListener('click',async()=>{
          const note=reason.value.trim();
          if(note.length<10){status.textContent='Record at least 10 characters explaining the contact outcome.';reason.focus();return;}
          if(!window.confirm('Confirm '+labelText.toLowerCase()+'? The booking will be released. Payments and audit history stay recorded.'))return;
          btn.disabled=true;status.textContent='Saving reason and status…';
          try{
            await operations('close_reservation',{p_property:config.propertyId,p_reservation:item.id,p_status:next,p_note:note});
            await loadData();
            msg('actionStatus','Reservation '+(RESERVATION_STATES[next]||next).toLowerCase()+'. The contact reason was recorded in the audit trail. Review payments separately.',true);
            void window.HotelDailyRecords?.load(true);
          }catch(error){status.textContent=error.message||'Could not close reservation.';}
          finally{btn.disabled=false;}
        });
        buttons.append(btn);
      }
      close.append(buttons,status);controls.append(close);
    }
    if(controls.childElementCount)card.append(controls);
    root.append(card);
  }
}
async function loadData(){
  const [r,b,res,guestRecords]=await Promise.all([operations('room_types'),operations('rooms'),operations('reservations'),operations('guests').catch(()=>({data:[]}))]);
  roomTypes=(r.data||[]).sort((a,b)=>a.name.localeCompare(b.name));
  rooms=(b.data||[]).sort((a,b)=>a.room_number.localeCompare(b.room_number));
  reservations=(res.data||[]).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100);
  guests=Array.isArray(guestRecords.data)?guestRecords.data:[];
  const summary=el('metrics');summary.replaceChildren(
    metric('Room categories',String(roomTypes.length)),
    metric('Physical rooms',String(rooms.length)),
    metric('Ready for arrival',String(rooms.filter(r=>r.active&&r.condition==='ready').length)),
    metric('Active reservations',String(reservations.filter(r=>r.status==='confirmed'||r.status==='checked_in').length))
  );
  renderRates();renderInventory();renderReservations();
  const hasCategory=roomTypes.some(type=>type.active&&type.nightly_rate_minor>0);
  const hasPublishedRoom=rooms.some(room=>room.active&&roomTypes.some(type=>type.id===room.room_type_id&&type.active&&type.nightly_rate_minor>0));
  // Optional onboarding guide: a cached or older staff page may not contain it.
  const guide=maybeEl('publishGuide');
  if(guide)guide.hidden=hasPublishedRoom;
  const categoryStep=maybeEl('publishCategoryStep');
  if(categoryStep)categoryStep.textContent=hasCategory?'Category and nightly rate added.':'Add a category and nightly rate.';
  const roomStep=maybeEl('publishRoomStep');
  if(roomStep)roomStep.textContent=hasPublishedRoom?'Your first room is available for unreserved dates.':'Add the available room numbers.';
}
const ENQUIRY_ROLES=new Set(['owner','manager','front_desk','restaurant','housekeeping']);
const ENQUIRY_STATUS={open:'New request',in_progress:'In progress',resolved:'Resolved',cancelled:'Cancelled'};
const ENQUIRY_KINDS={general:'Contact',dining:'Dining',event:'Event',service:'Service'};
function enquiryItem(record){
  const card=node('article',undefined,'admin-record enquiry-record');
  const heading=node('div',undefined,'enquiry-heading');
  heading.append(node('strong',record.reference),node('span',ENQUIRY_KINDS[record.kind]||'Request','eyebrow'));
  const badge=node('span',ENQUIRY_STATUS[record.status]||record.status,'enquiry-badge');
  heading.append(badge);card.append(heading);
  card.append(node('h3',record.guest_name+' · '+record.topic.replace(/_/g,' ')));
  card.append(node('p',[record.guest_email,record.guest_phone].filter(Boolean).join(' · '),'enquiry-contact'));
  const preference=[record.preferred_date,record.preferred_time?.slice(0,5),record.party_size?record.party_size+' guests':null].filter(Boolean).join(' · ');
  if(preference)card.append(node('p','Requested: '+preference,'helper'));
  card.append(node('p',record.detail,'enquiry-detail'));
  card.append(node('small','Received '+new Date(record.created_at).toLocaleString('en-GB',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})+' (Lagos time)'));
  const controls=node('div',undefined,'enquiry-update');
  const statusLabel=node('label','Status'),select=document.createElement('select');
  for(const [value,label] of Object.entries(ENQUIRY_STATUS)){
    const option=node('option',label);option.value=value;select.append(option);
  }
  select.value=record.status;select.setAttribute('aria-label','Status for '+record.reference);statusLabel.append(select);
  const noteLabel=node('label','Internal note'),note=document.createElement('textarea');
  note.value=record.staff_note||'';note.maxLength=2000;note.rows=3;
  note.setAttribute('aria-label','Internal note for '+record.reference);noteLabel.append(note);
  const save=node('button','Save update','button');save.type='button';
  const message=node('p','','form-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  save.addEventListener('click',async()=>{
    const nextNote=note.value.trim(),nextStatus=select.value;
    if(nextNote===(record.staff_note||'')&&nextStatus===record.status){message.textContent='No changes to save.';return;}
    save.disabled=true;select.disabled=true;note.disabled=true;message.textContent='Saving…';
    try{
      await operations('update_enquiry',{p_property:config.propertyId,p_enquiry:record.id,
        p_status:nextStatus,p_note:nextNote,p_version:record.version});
      record.status=nextStatus;record.staff_note=nextNote;record.version+=1;
      badge.textContent=ENQUIRY_STATUS[nextStatus];note.value=nextNote;
      message.textContent='Saved. Contact the guest separately to confirm any arrangements.';
    }catch(error){message.textContent=(error.message||'Could not confirm the update.')+' Use Refresh requests to read the latest record.';}
    finally{save.disabled=false;select.disabled=false;note.disabled=false;}
  });
  controls.append(statusLabel,noteLabel,save);card.append(controls,message);
  return card;
}
async function loadEnquiries(rootId){
  const root=el(rootId),statusId=rootId+'Status';
  if(!ENQUIRY_ROLES.has(currentRole)){root.replaceChildren();return;}
  const userId=identity?.id,role=currentRole;
  msg(statusId,'Loading guest requests…',true);
  try{
    const response=await operations('guest_enquiries');
    if(!session||identity?.id!==userId||currentRole!==role)return;
    const records=Array.isArray(response.data)?response.data:[];
    root.replaceChildren();
    records.forEach(record=>root.append(enquiryItem(record)));
    if(!records.length)root.append(node('p','No requests for your team yet.','helper'));
    msg(statusId,records.length?records.length+' recent requests. '+records.filter(record=>record.status==='open').length+' new.':'Your inbox is up to date.',true);
  }catch(error){if(session&&identity?.id===userId)msg(statusId,error.message||'Requests are temporarily unavailable.');}
}
const STAFF_VIEWS={
  front_desk:{resource:'reservations',title:'Reservations',description:'View the reservation records assigned to HOTEL front desk.'},
  restaurant:{resource:'restaurant_orders',title:'Restaurant orders',description:'Review restaurant orders authorized for your role.'},
  inventory:{resource:'stock_items',title:'Inventory items',description:'Review HOTEL stock records.'},
  housekeeping:{resource:'housekeeping_tasks',title:'Housekeeping tasks',description:'Review assigned housekeeping operations.'},
  accountant:{resource:'payment_transactions',title:'Payment transactions',description:'Review payment records authorized for finance staff.'}
};
const STAFF_SECTION_IDS=Object.freeze({
  login:'loginSection',reset:'resetPasswordSection',password:'setPasswordSection',
  admin:'dashboardSection',staff:'staffWorkspace'
});
function loggedIn(view){
  const activeId=STAFF_SECTION_IDS[view];
  if(!activeId||!el(activeId)){
    throw Error('The HOTEL staff page is missing a required section. Refresh this page and try again.');
  }
  for(const [name,id] of Object.entries(STAFF_SECTION_IDS)){
    const section=maybeEl(id);
    if(section)section.hidden=name!==view;
  }
  if(view==='login'){
    // A stale or incomplete dashboard must not break the staff login form.
    try{window.HotelDailyRecords?.clear();}catch(error){console.warn('Could not clear daily workspace',error);}
    try{window.HotelCatalogAdmin?.clear();}catch(error){console.warn('Could not clear catalog workspace',error);}
  }
}
function simpleStaffItem(item,index){
  const card=node('div',undefined,'admin-record');
  const desc=node('div');
  const title=String(item.room_number||item.name||item.action||item.status||'Record '+(index+1));
  desc.append(node('div',title,'name'));
  const fields=['status','created_at','check_in','check_out','unit','role'];
  const detail=fields.filter(k=>item[k]!==null&&item[k]!==undefined).map(k=>k.replace(/_/g,' ')+': '+String(item[k]).slice(0,90)).join(' · ');
  if(detail)desc.append(node('small',detail));
  card.append(desc);return card;
}
async function loadStaffWorkspace(){
  const view=STAFF_VIEWS[currentRole];
  if(!view){msg('staffWorkspaceStatus','No staff workspace is configured for this role. Ask the owner for assistance.');return;}
  el('staffRoleLabel').textContent='HOTEL '+currentRole.replace(/_/g,' ').toUpperCase();
  el('staffWorkspaceTitle').textContent=view.title;
  el('staffWorkspaceDescription').textContent=view.description;
  const root=el('staffWorkspaceRecords');
  root.replaceChildren();msg('staffWorkspaceStatus','Loading your records…',true);
  const enquiriesCard=maybeEl('staffEnquiriesCard');
  if(enquiriesCard)enquiriesCard.hidden=!ENQUIRY_ROLES.has(currentRole);
  if(ENQUIRY_ROLES.has(currentRole)&&maybeEl('staffEnquiriesList'))void loadEnquiries('staffEnquiriesList');
  try{
    const data=await operations(view.resource);
    const rows=Array.isArray(data.data)?data.data:[];
    rows.slice(0,100).forEach((record,i)=>root.append(simpleStaffItem(record,i)));
    msg('staffWorkspaceStatus',rows.length?rows.length+' records loaded.':'No records are currently assigned to this role.',true);
  }catch(err){msg('staffWorkspaceStatus',err.message||'Unable to load these records.');}
}
async function loadStaffMembers(){
  if(currentRole!=='owner')return;
  const root=el('staffMembersList');root.replaceChildren();
  try{
    const data=await operations('staff_memberships');
    const rows=Array.isArray(data.data)?data.data:[];
    if(!rows.length){root.append(node('p','There are no staff members yet.','helper'));return;}
    for(const person of rows){
      const card=node('div',undefined,'admin-record');
      const info=node('div');
      info.append(node('div',String(person.role).replace(/_/g,' '),'name'));
      info.append(node('small',person.active?'Active access':'Inactive access'));
      card.append(info);root.append(card);
    }
  }catch(err){root.append(node('p',err.message||'Unable to load staff access.','form-message'));}
}
async function enterDashboard(){
  const role=await validateStaff();
  if(role==='owner'||role==='manager'){
    await loadData();
    const staffTab=maybeEl('staffAccessTab');
    if(staffTab)staffTab.hidden=role!=='owner';
    loggedIn('admin');
    openManagementTab('daily');
    msg('actionStatus','Welcome to HOTEL.',true);
    void loadEnquiries('enquiriesList');
    if(role==='owner')void loadStaffMembers();
  }else{
    loggedIn('staff');
    await loadStaffWorkspace();
  }
  msg('loginStatus','');
}
async function init(){
  loggedIn('login');
  try{
    config=await jsonFetch('/api/staff-config');
  }catch(e){
    el('setupNotice').hidden=false;
    el('setupNotice').textContent='HOTEL staff sign-in is temporarily unavailable. Please contact the property administrator.';
    el('loginButton').disabled=true;return;
  }
  try{
    const fragment=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
    const callbackAccess=fragment.get('access_token');
    const callbackRefresh=fragment.get('refresh_token');
    const invited=fragment.get('type')==='invite'||fragment.get('type')==='recovery';
    if(callbackAccess&&callbackRefresh&&callbackAccess.length<8192&&callbackRefresh.length<8192){
      const seconds=Number(fragment.get('expires_in'));
      setSession({
        access_token:callbackAccess,
        refresh_token:callbackRefresh,
        expiresAt:Date.now()+(Number.isFinite(seconds)&&seconds>=60&&seconds<=86400?seconds:3600)*1000
      });
      history.replaceState(null,'',location.pathname+location.search);
      if(invited){loggedIn('password');return;}
    }
    const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(saved?.access_token&&saved?.refresh_token){session=saved;await enterDashboard();}
  }catch(err){
    setSession(null);currentRole=null;loggedIn('login');
    msg('loginStatus','Please sign in to your invited HOTEL account.');
  }
}
el('setPasswordForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const password=el('newPassword').value;
  if(password.length<7||password!==el('confirmPassword').value){
    msg('setPasswordStatus','Use at least seven characters, and enter the same password twice.');return;
  }
  const button=el('setPasswordButton');button.disabled=true;
  msg('setPasswordStatus','Securing your account…');
  try{
    const token=await withToken();
    await jsonFetch(config.supabaseUrl+'/auth/v1/user',{
      method:'PUT',
      headers:{apikey:config.anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({password})
    });
    el('newPassword').value='';el('confirmPassword').value='';
    await enterDashboard();
  }catch(err){msg('setPasswordStatus',err.message||'Could not save password.');}
  finally{button.disabled=false;}
});
el('inviteStaffForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(currentRole!=='owner')return;
  const form=e.currentTarget,body=new FormData(form);
  const button=el('inviteStaffButton');button.disabled=true;
  msg('inviteStaffStatus','Sending a private HOTEL invitation…');
  try{
    const token=await withToken();
    const data=await jsonFetch('/api/staff-invite',{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({email:String(body.get('email')||'').trim(),role:String(body.get('role')||'')})
    });
    form.reset();
    msg('inviteStaffStatus',data.message||'Staff access invitation sent.',true);
    await loadStaffMembers();
  }catch(err){msg('inviteStaffStatus',err.message||'Could not invite staff.');}
  finally{button.disabled=false;}
});
// Supabase sends one-time recovery links; this never creates a new staff account.
el('forgotPasswordButton').addEventListener('click',()=>{
  el('resetPasswordEmail').value=el('loginEmail').value.trim();
  msg('resetPasswordStatus','');
  loggedIn('reset');
  el('resetPasswordEmail').focus();
});
el('backToLoginButton').addEventListener('click',()=>{
  msg('resetPasswordStatus','');
  loggedIn('login');
  el('loginEmail').focus();
});
el('resetPasswordForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=el('resetPasswordEmail').value.trim();
  const button=el('resetPasswordSubmit');
  if(!config?.supabaseUrl||!config?.anonKey){
    msg('resetPasswordStatus','Account recovery is temporarily unavailable. Please contact the HOTEL owner.');
    return;
  }
  button.disabled=true;
  msg('resetPasswordStatus','Requesting a recovery email…',true);
  try{
    const redirect=new URL('/manage.html',location.origin).href;
    await jsonFetch(config.supabaseUrl+'/auth/v1/recover?'+new URLSearchParams({redirect_to:redirect}),{
      method:'POST',
      headers:{apikey:config.anonKey,'Content-Type':'application/json'},
      body:JSON.stringify({email})
    });
    msg('resetPasswordStatus','If this email is registered, you will receive a recovery link. Check your inbox and spam folder.',true);
  }catch{
    // Do not expose whether an email exists in the authentication database.
    msg('resetPasswordStatus','We could not complete the request right now. Please try again later or contact the HOTEL owner.');
  }finally{button.disabled=false;}
});
el('toggleLoginPassword').addEventListener('click',()=>{
  const input=el('loginPassword'),button=el('toggleLoginPassword');
  const revealed=input.type==='password';
  input.type=revealed?'text':'password';
  button.textContent=revealed?'Hide':'Show';
  button.setAttribute('aria-pressed',String(revealed));
  button.setAttribute('aria-label',revealed?'Hide password':'Show password');
});
for(const field of ['loginEmail','loginPassword'])el(field).addEventListener('input',()=>{
  el('loginEmail').removeAttribute('aria-invalid');el('loginPassword').removeAttribute('aria-invalid');
});
el('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=el('loginButton');button.disabled=true;msg('loginStatus','Signing in…');
  try{
    const result=await jsonFetch(config.supabaseUrl+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},
      body:JSON.stringify({email:el('loginEmail').value.trim(),password:el('loginPassword').value})
    });
    if(!result.access_token||!result.refresh_token)throw Error('Sign-in response incomplete.');
    setSession({access_token:result.access_token,refresh_token:result.refresh_token,expiresAt:Date.now()+(result.expires_in||3600)*1000});
    await enterDashboard();el('loginPassword').value='';
  }catch(err){
    setSession(null);currentRole=null;loggedIn('login');
    const text=String(err.message||'');
    if(/invalid[_ ](?:login[_ ]?)?credentials|invalid_grant|incorrect password/i.test(text)){
      el('loginEmail').setAttribute('aria-invalid','true');
      el('loginPassword').setAttribute('aria-invalid','true');
      msg('loginStatus','Incorrect email or password. Check your details or use Forgot password.');
    }else if(/too many requests|rate limit|429/i.test(text)){
      msg('loginStatus','Too many attempts. Please wait before trying again.');
    }else{
      msg('loginStatus',text||'Sign in could not be completed. Please try again.');
    }
  }finally{button.disabled=false;}
});
async function signOut(){
  const token=session?.access_token;
  if(token&&config){
    try{
      await fetch(config.supabaseUrl+'/auth/v1/logout',{
        method:'POST',
        headers:{apikey:config.anonKey,Authorization:'Bearer '+token}
      });
    }catch{/* Sign-out still clears this browser session. */}
  }
  setSession(null);identity=null;currentRole=null;loggedIn('login');
  el('enquiriesList').replaceChildren();el('staffEnquiriesList').replaceChildren();
  msg('loginStatus','Signed out.',true);
}
for(const field of ['reservationSearch','reservationStatusFilter'])maybeEl(field)?.addEventListener(field==='reservationSearch'?'input':'change',renderReservations);
el('logoutButton').addEventListener('click',signOut);
el('staffLogoutButton').addEventListener('click',signOut);
el('staffRefreshButton').addEventListener('click',loadStaffWorkspace);
el('refreshButton').addEventListener('click',async()=>{
  el('refreshButton').disabled=true;msg('actionStatus','Refreshing records…');
  try{await loadData();await loadEnquiries('enquiriesList');if(el('dailyTab').hidden===false)await window.HotelDailyRecords?.load(true);if(!el('menuTab').hidden||!el('stockTab').hidden)await window.HotelCatalogAdmin?.load();msg('actionStatus','Up to date.',true);}catch(e){msg('actionStatus',e.message);}
  finally{el('refreshButton').disabled=false;}
});
function openManagementTab(tab){
  if(!['daily','rates','inventory','reservations','enquiries','menu','stock','staff'].includes(tab)||(tab==='staff'&&currentRole!=='owner'))return;
  document.querySelectorAll('[data-tab]').forEach(button=>{const selected=button.dataset.tab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  for(const value of ['daily','rates','inventory','reservations','enquiries','menu','stock','staff']){
    const pane=maybeEl(value+'Tab');
    if(pane)pane.hidden=tab!==value;
  }
  if(tab==='daily')void window.HotelDailyRecords?.load();
  if(tab==='menu'||tab==='stock')void window.HotelCatalogAdmin?.load();
  const titles={daily:'Your hotel, at a glance.',rates:'Rooms & pricing.',inventory:'Room status.',reservations:'Reservations.',enquiries:'Guest requests.',menu:'Food & menu.',stock:'Stock & supplies.',staff:'Your team.'};
  el('dashboardHeading').textContent=titles[tab];
}
document.querySelectorAll('[data-tab]').forEach(button=>{
  const tab=button.dataset.tab;button.id='managementTab-'+tab;button.setAttribute('aria-controls',tab+'Tab');button.tabIndex=button.getAttribute('aria-selected')==='true'?0:-1;
  el(tab+'Tab').setAttribute('role','tabpanel');el(tab+'Tab').setAttribute('aria-labelledby',button.id);
  button.addEventListener('click',()=>openManagementTab(tab));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=Array.from(document.querySelectorAll('[data-tab]')).filter(item=>!item.hidden);
    const index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+tabs.length)%tabs.length;
    openManagementTab(tabs[next].dataset.tab);tabs[next].focus();
  });
});
const workspaceMedia=window.matchMedia('(min-width: 1001px)');
const setTabOrientation=()=>document.querySelector('.admin-tabs')?.setAttribute('aria-orientation',workspaceMedia.matches?'vertical':'horizontal');
workspaceMedia.addEventListener('change',setTabOrientation);setTabOrientation();
document.querySelectorAll('[data-open-tab]').forEach(button=>button.addEventListener('click',()=>{
  openManagementTab(button.dataset.openTab);
  const form=el(button.dataset.openTab==='rates'?'newTypeForm':'newRoomForm');form.scrollIntoView({behavior:'smooth',block:'center'});form.querySelector('input')?.focus({preventScroll:true});
}));
document.querySelectorAll('[data-refresh-enquiries]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;
  try{await loadEnquiries(button.dataset.refreshEnquiries);}finally{button.disabled=false;}
}));
el('newTypeForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,fields=new FormData(form),price=validPrice(fields.get('price'));
  const name=String(fields.get('name')||'').trim(),capacity=Number(fields.get('capacity'));
  if(!price||name.length<2||!Number.isSafeInteger(capacity)||capacity<1||capacity>8){msg('actionStatus','Check category name, capacity and nightly rate.');return;}
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{
    await operations('create_room_type',{p_property:config.propertyId,p_name:name,p_capacity:capacity,p_rate_minor:price});
    announceRateUpdate();
    form.reset();await loadData();openManagementTab('inventory');
    const created=roomTypes.find(type=>type.name===name);if(created)el('newRoomType').value=created.id;
    el('newRoomForm').elements.namedItem('roomNumber').focus();
    msg('actionStatus','Category and price saved. Add your room number to make it available to guests.',true);
  }catch(err){msg('actionStatus',err.message);}finally{button.disabled=false;}
});
el('newRoomForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,fields=new FormData(form),roomNumber=String(fields.get('roomNumber')||'').trim();
  if(!roomNumber||roomNumber.length>120)return;
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{
    await operations('create_room',{p_property:config.propertyId,p_room_type:String(fields.get('roomType')),p_room_number:roomNumber});
    form.reset();await loadData();msg('actionStatus','Room '+roomNumber+' is ready. Guests can now find it for available dates and reserve online.',true);
  }catch(err){msg('actionStatus',err.message);}finally{button.disabled=false;}
});
init();
