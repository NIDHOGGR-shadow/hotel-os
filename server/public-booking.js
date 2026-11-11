import {randomUUID} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY=86400000;
function reply(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body);}
function baseConfig(env){
 const url=env.SUPABASE_URL?.replace(/\/$/,'');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 const property=env.HOTEL_PROPERTY_ID;
 if(!url||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key||key.length<20||!UUID.test(property||''))return null;
 return {url,key,property};
}
const headers=k=>({apikey:k,Authorization:'Bearer '+k,'Content-Type':'application/json',Accept:'application/json'});
async function rpc(db,name,params,request){
 const response=await request(db.url+'/rest/v1/rpc/'+name,{
 method:'POST',headers:headers(db.key),body:JSON.stringify(params),signal:AbortSignal.timeout(12000)});
 if(!response.ok){
  const body=await response.json().catch(()=>({}));
  const e=new Error(body?.message==='No available room for these dates'?'This room is no longer available for the selected dates.':'The hotel's booking records are temporarily unavailable.');
  e.code=body?.message==='No available room for these dates'?409:503;throw e;
 }
 return response.json();
}
function parsedDate(s){if(typeof s!=='string'||!DATE.test(s))return NaN;const n=Date.parse(s+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s?n:NaN;}
function stay(body,now=Date.now()){
 const a=parsedDate(body?.checkIn),b=parsedDate(body?.checkOut);
 const utcToday=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z');
 const guests=Number(body?.guests);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<utcToday||b<=a||(b-a)>30*ISO_DAY||!Number.isInteger(guests)||guests<1||guests>8)return null;
 return {checkIn:body.checkIn,checkOut:body.checkOut,guests};
}
function checkoutData(body,now){
 const span=stay(body,now),roomTypeId=body?.roomTypeId,guestName=body?.guestName,guestEmail=body?.guestEmail,guestPhone=body?.guestPhone??'';
 if(!span||typeof roomTypeId!=='string'||!UUID.test(roomTypeId)||typeof guestName!=='string'||guestName.trim().length<2||guestName.trim().length>140||
 typeof guestEmail!=='string'||guestEmail.length>254||!EMAIL.test(guestEmail)||typeof guestPhone!=='string'||guestPhone.length>25||!/^[+\d\s()\-]*$/.test(guestPhone))return null;
 return {...span,roomTypeId,guestName:guestName.trim(),guestEmail:guestEmail.trim().toLowerCase(),guestPhone:guestPhone.trim()};
}
async function bodyOf(req){
 if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)){if(JSON.stringify(req.body).length>8192)throw new Error('BAD_BODY');return req.body;}
 if(typeof req.body==='string'){if(req.body.length>8192)throw new Error('BAD_BODY');return JSON.parse(req.body);}
 const chunks=[];let size=0;
 for await (const chunk of req){size+=chunk.length;if(size>8192)throw new Error('BAD_BODY');chunks.push(Buffer.from(chunk));}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function paystackKey(env){return /^sk_(test|live)_[A-Za-z0-9]+$/.test(env.PAYSTACK_SECRET_KEY||'')?env.PAYSTACK_SECRET_KEY:null;}
export async function handlePublicAvailability(req,res,env=process.env,request=fetch,now=Date.now()){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
 const db=baseConfig(env);if(!db)return reply(res,503,{error:'Hotel availability is not connected to a property yet.'});
 const span=stay(req.query,now);
 if(!span)return reply(res,422,{error:'Choose valid dates and guest count.'});
 try{
  const rows=await rpc(db,'hotel_public_availability',{p_property:db.property,p_check_in:span.checkIn,p_check_out:span.checkOut,p_guests:span.guests},request);
  if(!Array.isArray(rows))return reply(res,503,{error:'Hotel inventory unavailable.'});
  return reply(res,200,{rooms:rows.map(r=>({id:r.id,name:r.name,capacity:r.capacity,nightlyRateMinor:r.nightly_rate_minor,availableRooms:r.available_rooms}))});
 }catch{return reply(res,503,{error:'Unable to check live room availability at the moment.'});}
}
export async function handlePaystackCheckout(req,res,env=process.env,request=fetch,now=Date.now()){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'Method not allowed'});}
 const db=baseConfig(env),key=paystackKey(env);
 if(!db||!key||env.HOTEL_PAYMENTS_ENABLED!=='true')
  return reply(res,503,{error:'Online payments are not ready for this property yet. No charge has been made.'});
 let body;
 try{body=await bodyOf(req);}catch{return reply(res,400,{error:'Invalid checkout request.'});}
 const input=checkoutData(body,now);
 if(!input)return reply(res,422,{error:'Please check your stay dates, room and contact details.'});
 const ref='hotel-'+randomUUID();
 let allocated;
 try{
  const rows=await rpc(db,'hotel_create_checkout',{
   p_property:db.property,p_room_type:input.roomTypeId,p_check_in:input.checkIn,
   p_check_out:input.checkOut,p_guests:input.guests,p_name:input.guestName,
   p_email:input.guestEmail,p_phone:input.guestPhone,p_reference:ref
  },request);
  allocated=Array.isArray(rows)?rows[0]:null;
  if(!allocated||allocated.reference!==ref||!Number.isSafeInteger(Number(allocated.amount_minor))||Number(allocated.amount_minor)<=0||allocated.currency!=='NGN')
   throw new Error('Invalid authoritative room quote');
  const callback='https://hotel-os-livid.vercel.app/payment-callback.html';
  const charge=await request('https://api.paystack.co/transaction/initialize',{
   method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({email:input.guestEmail,amount:String(allocated.amount_minor),currency:'NGN',reference:ref,callback_url:callback}),
   signal:AbortSignal.timeout(12000)
  });
  if(!charge.ok)throw new Error('Paystack checkout unavailable');
  const data=await charge.json();
  const url=data?.data?.authorization_url;
  if(data?.status!==true||data?.data?.reference!==ref||typeof url!=='string'||!/^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9]+\/?$/.test(url))
   throw new Error('Untrusted Paystack checkout response');
  const recorded=await request(db.url+'/rest/v1/hotel_checkout_sessions?reference=eq.'+encodeURIComponent(ref),{
   method:'PATCH',headers:{...headers(db.key),Prefer:'return=minimal'},body:JSON.stringify({status:'initialized'}),signal:AbortSignal.timeout(10000)
  });
  if(!recorded.ok)throw new Error('Could not save payment initiation');
  return reply(res,200,{authorizationUrl:url,reference:ref});
 }catch(error){
  // Holds expire automatically after 60 minutes. Never attempt to release a hold after an
  // ambiguous network failure: Paystack might still complete the payment.
  return reply(res,error.code===409?409:503,{error:error.code===409?error.message:'Unable to start secure checkout. No new checkout link has been issued.'});
 }
}
