import {randomUUID} from 'node:crypto';
import {supabaseAdminConfig,supabaseAdminHeaders} from './supabase-admin.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY=86400000;
function reply(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(body);}
function baseConfig(env){
 const admin=supabaseAdminConfig(env);
 const property=env.HOTEL_PROPERTY_ID;
 if(!admin||!UUID.test(property||''))return null;
 return {...admin,property};
}
const headers=admin=>supabaseAdminHeaders(admin);
async function rpc(db,name,params,request){
 const response=await request(db.url+'/rest/v1/rpc/'+name,{
 method:'POST',headers:headers(db),body:JSON.stringify(params),signal:AbortSignal.timeout(12000)});
 if(!response.ok){
  const body=await response.json().catch(()=>({}));
  const e=new Error(body?.message==='No available room for these dates'?'This room is no longer available for the selected dates.':"The hotel booking records are temporarily unavailable.");
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
/** The callback is display-only: only verified server-side webhooks confirm reservations.
 * Keep the legacy Hotel OS URL until each hotel installs its own configured HTTPS origin.
 * Never derive it from request Host/Origin headers or client checkout fields.
 */
export function hotelPaymentCallback(env){
 const base=env.HOTEL_PUBLIC_BASE_URL;
 if(base===undefined||base==='')return 'https://hotel-os-livid.vercel.app/payment-callback.html';
 if(typeof base!=='string'||base!==base.trim())return null;
 try{
  const url=new URL(base);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||
     !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(url.hostname)||!url.hostname.includes('.'))return null;
  return url.origin+'/payment-callback.html';
 }catch{return null;}
}

export async function handlePublicAvailability(req,res,env=process.env,request=fetch,now=Date.now()){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
 const db=baseConfig(env);if(!db)return reply(res,503,{error:'Hotel availability is not connected to a property yet.'});
 const span=stay(req.query,now);
 if(!span)return reply(res,422,{error:'Choose valid dates and guest count.'});
 try{
  const rows=await rpc(db,'hotel_public_availability',{p_property:db.property,p_check_in:span.checkIn,p_check_out:span.checkOut,p_guests:span.guests},request);
  const rooms=validatedPublicRooms(rows);
  if(!rooms)return reply(res,503,{error:'Hotel inventory unavailable.'});
  return reply(res,200,{rooms});
 }catch{return reply(res,503,{error:'Unable to check live room availability at the moment.'});}
}
function validatedPublicRooms(rows){
 if(!Array.isArray(rows)||rows.length>100)return null;
 const ids=new Set(),clean=[];
 for(const room of rows){
  if(!room||typeof room!=='object'||Array.isArray(room)||
    typeof room.id!=='string'||!UUID.test(room.id)||
    typeof room.name!=='string'||room.name.trim().length<1||room.name.trim().length>140||
    !Number.isSafeInteger(room.capacity)||room.capacity<1||room.capacity>30||
    !Number.isSafeInteger(room.nightly_rate_minor)||room.nightly_rate_minor<=0||
    !Number.isSafeInteger(room.available_rooms)||room.available_rooms<0||
    ids.has(room.id.toLowerCase()))return null;
  ids.add(room.id.toLowerCase());
  clean.push({id:room.id,name:room.name.trim(),capacity:room.capacity,
   nightlyRateMinor:room.nightly_rate_minor,availableRooms:room.available_rooms});
 }
 return clean;
}
function checkoutAttribution(body){
 const incoming=body?.attribution;
 if(!incoming||incoming.consent!==true||typeof incoming!=='object'||Array.isArray(incoming))return null;
 const fields={source:100,medium:100,campaign:160,campaign_id:80,content:160,term:160};
 const result={};
 for(const [key,max] of Object.entries(fields)){
  const value=incoming[key];
  if(typeof value!=='string'||value.includes('@'))continue;
  const clean=value.trim().replace(/[^A-Za-z0-9 _.-]/g,'').slice(0,max);
  if(clean)result[key]=clean;
 }
 return Object.keys(result).length?result:null;
}
function checkoutReadiness(env){
 const db=baseConfig(env),key=paystackKey(env),callback=hotelPaymentCallback(env);
 if(!db||!key||!callback||env.HOTEL_PAYMENTS_ENABLED!=='true')
  return {ready:false,reason:'not_configured'};
 // Never accept test money as payment for real inventory on production.
 if(env.VERCEL_ENV==='production'&&!key.startsWith('sk_live_'))
  return {ready:false,reason:'requires_live_key'};
 // The generic HOTEL demo property cannot accept live money unless a human
 // explicitly verifies its identity, rates, operating policy and inventory.
 if(env.VERCEL_ENV==='production'&&env.HOTEL_REAL_PROPERTY_VERIFIED!=='true')
  return {ready:false,reason:'property_not_verified'};
 return {ready:true,db,key,callback};
}
export async function handlePaystackCheckout(req,res,env=process.env,request=fetch,now=Date.now()){
 if(req.method!=='POST'&&req.method!=='GET'){res.setHeader('Allow','GET, POST');return reply(res,405,{error:'Method not allowed'});}
 const readiness=checkoutReadiness(env);
 if(req.method==='GET')
  return reply(res,200,{checkoutAvailable:readiness.ready,
   message:readiness.ready?
    'Secure checkout is configured for this property. Payment remains subject to Paystack verification.':
    'Room browsing is available. Online payment checkout is not enabled for this property yet.'});
 if(!readiness.ready){
  const error=readiness.reason==='requires_live_key'?
   'Real room checkout is unavailable until live payment processing is configured. No charge has been made.':
   'Online payments are not ready for this property yet. No charge has been made.';
  return reply(res,503,{error});
 }
 const {db,key,callback}=readiness;
 let body;
 try{body=await bodyOf(req);}catch{return reply(res,400,{error:'Invalid checkout request.'});}
 const input=checkoutData(body,now);
 const attribution=checkoutAttribution(body);
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
   method:'PATCH',headers:{...headers(db),Prefer:'return=minimal'},body:JSON.stringify({status:'initialized'}),signal:AbortSignal.timeout(10000)
  });
  if(!recorded.ok)throw new Error('Could not save payment initiation');
  // Save approved campaign metadata against a server-generated checkout reference.
  // A marketing DB error must never interrupt an otherwise valid customer payment.
  if(attribution){
   try{
    await request(db.url+'/rest/v1/hotel_booking_attribution?on_conflict=reference',{
     method:'POST',
     headers:{...headers(db),Prefer:'resolution=ignore-duplicates,return=minimal'},
     body:JSON.stringify({reference:ref,property_id:db.property,...attribution}),
     signal:AbortSignal.timeout(2500)
    });
   }catch{}
  }
  return reply(res,200,{authorizationUrl:url,reference:ref});
 }catch(error){
  // Holds expire automatically after 60 minutes. Never attempt to release a hold after an
  // ambiguous network failure: Paystack might still complete the payment.
  return reply(res,error.code===409?409:503,{error:error.code===409?error.message:'Unable to start secure checkout. No new checkout link has been issued.'});
 }
}
