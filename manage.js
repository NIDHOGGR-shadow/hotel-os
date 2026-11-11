'use strict';
// All rates and reservations are database records. No sample state is written to checkout.
const el=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(n/100);
let config=null,session=null,identity=null,roomTypes=[],rooms=[],reservations=[];
const SESSION_KEY='hotel-os-staff-session';
const msg=(id,text,ok=false)=>{const node=el(id);node.textContent=text||'';node.style.color=ok?'#266447':'#923544'};
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
  const result=await operations('staff_memberships');
  const mine=result.data?.find(x=>x.user_id===identity.id&&x.property_id===config.propertyId&&x.active);
  if(!mine||!['owner','manager'].includes(mine.role))
    throw Error('Your account does not have owner or manager access to this property.');
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
        await loadData();
        msg('actionStatus',item.name+' is now '+money(minor)+' per night for new reservations. The booking API will charge this rate.',true);
      }catch(e){msg('actionStatus',e.message);}finally{save.disabled=false;}
    });
    controls.append(label,save);card.append(details,controls);root.append(card);
  }
}
function renderInventory(){
  const root=el('physicalRooms');root.replaceChildren();
  if(!rooms.length){root.append(node('p','No physical rooms have been added. A category cannot accept bookings until at least one room is ready.','helper'));}
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
function renderReservations(){
  const root=el('reservationList');root.replaceChildren();
  if(!reservations.length){root.append(node('p','There are no reservations recorded for this hotel yet.','helper'));return;}
  const types=new Map(roomTypes.map(t=>[t.id,t.name]));
  for(const item of reservations){
    const card=node('div',undefined,'admin-record'),info=node('div');
    info.append(node('div',types.get(item.room_type_id)||'Reservation','name'));
    info.append(node('small',item.check_in+' → '+item.check_out+' · Ref: '+item.id.slice(0,8)+' · '+item.status));
    const cost=node('div',Number.isSafeInteger(item.total_minor)?money(item.total_minor):'Amount unavailable');
    card.append(info,cost);root.append(card);
  }
}
async function loadData(){
  const [r,b,res]=await Promise.all([operations('room_types'),operations('rooms'),operations('reservations')]);
  roomTypes=(r.data||[]).sort((a,b)=>a.name.localeCompare(b.name));
  rooms=(b.data||[]).sort((a,b)=>a.room_number.localeCompare(b.room_number));
  reservations=(res.data||[]).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100);
  const summary=el('metrics');summary.replaceChildren(
    metric('Room categories',String(roomTypes.length)),
    metric('Physical rooms',String(rooms.length)),
    metric('Ready rooms',String(rooms.filter(r=>r.active&&r.condition==='ready').length))
  );
  renderRates();renderInventory();renderReservations();
}
function loggedIn(value){
  el('loginSection').hidden=value;el('signupSection').hidden=true;
  el('dashboardSection').hidden=!value;
}
async function enterDashboard(){
  await validateStaff();
  await loadData();
  loggedIn(true);
  msg('loginStatus','');
}
async function init(){
  try{
    config=await jsonFetch('/api/staff-config');
  }catch(e){
    el('setupNotice').hidden=false;
    el('setupNotice').textContent='Hotel property setup required: '+e.message+' Connect a dedicated HOTEL Supabase property and set Vercel environment variables before staff login will work.';
    el('loginButton').disabled=true;return;
  }
  try{
    // Supabase email-confirmation callbacks may carry a short-lived session in
    // the URL fragment. Store it only in this tab and immediately clear the URL.
    const fragment=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
    const callbackAccess=fragment.get('access_token');
    const callbackRefresh=fragment.get('refresh_token');
    if(callbackAccess&&callbackRefresh&&callbackAccess.length<8192&&callbackRefresh.length<8192){
      const seconds=Number(fragment.get('expires_in'));
      setSession({
        access_token:callbackAccess,
        refresh_token:callbackRefresh,
        expiresAt:Date.now()+(Number.isFinite(seconds)&&seconds>=60&&seconds<=86400?seconds:3600)*1000
      });
      history.replaceState(null,'',location.pathname+location.search);
    }
    const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    if(saved?.access_token&&saved?.refresh_token){session=saved;await enterDashboard();}
  }catch{setSession(null);loggedIn(false);}
}
// Registration creates only a Supabase Auth identity; it never grants a property role.
const showSignup=shown=>{
  el('loginSection').hidden=shown;
  el('signupSection').hidden=!shown;
  if(shown){el('signupEmail').value=el('loginEmail').value.trim();el('signupEmail').focus();}
  else el('loginEmail').focus();
};
el('showSignupButton').addEventListener('click',()=>showSignup(true));
el('returnToLogin').addEventListener('click',()=>showSignup(false));
el('signupForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!config)return;
  const email=el('signupEmail').value.trim(),password=el('signupPassword').value;
  if(password.length<12||password!==el('signupConfirm').value){
    msg('signupStatus','Passwords must match and contain at least 12 characters.');return;
  }
  const button=el('signupButton');button.disabled=true;msg('signupStatus','Creating your account…');
  try{
    const redirect=location.origin+'/manage.html';
    const response=await fetch(config.supabaseUrl+'/auth/v1/signup?'+
      new URLSearchParams({redirect_to:redirect}),{
      method:'POST',
      headers:{apikey:config.anonKey,'Content-Type':'application/json'},
      body:JSON.stringify({email,password})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.msg||data.error_description||data.message||'Account creation is currently unavailable.');
    // Never present signup as permission to manage property data.
    el('signupPassword').value='';el('signupConfirm').value='';
    msg('signupStatus','Registration request received. Check your email if confirmation is required, then sign in. The HOTEL owner must assign your staff role before dashboard access.',true);
  }catch(error){msg('signupStatus',error.message||'Account creation could not be completed.');}
  finally{button.disabled=false;}
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
    el('loginPassword').value='';await enterDashboard();msg('actionStatus','Welcome. Room rates are connected to HOTEL checkout.',true);
  }catch(err){setSession(null);loggedIn(false);msg('loginStatus',err.message||'Sign in failed.');}finally{button.disabled=false;}
});
el('logoutButton').addEventListener('click',()=>{setSession(null);identity=null;loggedIn(false);msg('actionStatus','');});
el('refreshButton').addEventListener('click',async()=>{
  el('refreshButton').disabled=true;msg('actionStatus','Refreshing records…');
  try{await loadData();msg('actionStatus','Up to date.',true);}catch(e){msg('actionStatus',e.message);}
  finally{el('refreshButton').disabled=false;}
});
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
  const tab=button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));
  for(const value of ['rates','inventory','reservations'])el(value+'Tab').hidden=tab!==value;
}));
el('newTypeForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,fields=new FormData(form),price=validPrice(fields.get('price'));
  const name=String(fields.get('name')||'').trim(),capacity=Number(fields.get('capacity'));
  if(!price||name.length<2||!Number.isSafeInteger(capacity)||capacity<1||capacity>8){msg('actionStatus','Check category name, capacity and nightly rate.');return;}
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{
    await operations('create_room_type',{p_property:config.propertyId,p_name:name,p_capacity:capacity,p_rate_minor:price});
    form.reset();await loadData();msg('actionStatus','Room category created. Add a physical room before accepting bookings.',true);
  }catch(err){msg('actionStatus',err.message);}finally{button.disabled=false;}
});
el('newRoomForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,fields=new FormData(form),roomNumber=String(fields.get('roomNumber')||'').trim();
  if(!roomNumber||roomNumber.length>120)return;
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{
    await operations('create_room',{p_property:config.propertyId,p_room_type:String(fields.get('roomType')),p_room_number:roomNumber});
    form.reset();await loadData();msg('actionStatus','Physical room created.',true);
  }catch(err){msg('actionStatus',err.message);}finally{button.disabled=false;}
});
init();
