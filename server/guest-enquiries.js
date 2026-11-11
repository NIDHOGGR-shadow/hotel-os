import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {supabaseUrl,supabaseServerKey,supabaseAdminHeaders} from './supabase-keys.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(['general','dining','event','service']);
const SERVICE_TOPICS=new Set(['housekeeping','laundry','room_service','transport','concierge','other']);
const FIELDS=new Set(['requestKey','kind','topic','guestName','email','phone','preferredDate','preferredTime','partySize','detail','website']);
class InputError extends Error{}
const stringHeader=(req,key)=>typeof req.headers?.[key]==='string'?req.headers[key]:'';
function reply(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(body);
}
function textField(body,key,min,max,{optional=false,multiline=false}={}){
  const value=body[key];
  if(optional&&(value===null||value===undefined||value===''))return '';
  if(typeof value!=='string')throw new InputError('Check your '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  const clean=value.trim();
  if(clean.length<min||clean.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)||(!multiline&&/[\r\n\t]/u.test(clean)))
    throw new InputError('Check your '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  return clean;
}
function parseInput(raw){
  let body=raw;
  if(typeof body==='string'){
    if(Buffer.byteLength(body,'utf8')>12000)throw new InputError('Your request is too long.');
    try{body=JSON.parse(body);}catch{throw new InputError('Invalid request.');}
  }
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!FIELDS.has(key))||Buffer.byteLength(JSON.stringify(body),'utf8')>12000)
    throw new InputError('Invalid request.');
  if(body.website)throw new InputError('Unable to accept this request.');
  if(!UUID.test(body.requestKey||'')||!KINDS.has(body.kind))throw new InputError('Invalid request.');
  const payload={
    kind:body.kind,
    topic:textField(body,'topic',1,120),
    guestName:textField(body,'guestName',2,100),
    email:textField(body,'email',3,254).toLowerCase(),
    phone:textField(body,'phone',0,25,{optional:true}),
    preferredDate:textField(body,'preferredDate',0,10,{optional:true})||null,
    preferredTime:textField(body,'preferredTime',0,5,{optional:true})||null,
    partySize:body.partySize===null||body.partySize===undefined||body.partySize===''?null:body.partySize,
    detail:textField(body,'detail',5,2000,{multiline:true})
  };
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))throw new InputError('Enter a valid email address.');
  if(payload.phone&&!/^[+0-9 ()-]{7,25}$/.test(payload.phone))throw new InputError('Enter a valid phone number.');
  if(payload.kind==='service'&&!SERVICE_TOPICS.has(payload.topic))throw new InputError('Choose a listed service.');
  if(payload.preferredDate){
    const parsed=new Date(payload.preferredDate+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.preferredDate)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==payload.preferredDate)
      throw new InputError('Choose a valid date.');
  }
  if(payload.preferredTime&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(payload.preferredTime))throw new InputError('Choose a valid time.');
  if(payload.partySize!==null&&(!Number.isSafeInteger(payload.partySize)||payload.partySize<1||payload.partySize>5000))
    throw new InputError('Enter a valid number of guests.');
  if(payload.kind==='dining'&&(!payload.preferredDate||!payload.preferredTime||!payload.partySize||payload.partySize>50))
    throw new InputError('Choose a dining date, time and party size up to 50.');
  if(payload.kind==='event'&&(!payload.preferredDate||!payload.partySize))throw new InputError('Choose an event date and number of guests.');
  return {requestKey:body.requestKey,payload};
}
function allowedOrigin(req,env){
  const origin=stringHeader(req,'origin');
  if(stringHeader(req,'sec-fetch-site')==='cross-site')return false;
  if(!origin)return true;
  try{return origin===new URL(env.HOTEL_PUBLIC_URL).origin;}catch{return false;}
}
function clientKey(req,env,key){
  // Vercel sets the forwarded header at its edge; do not trust it outside Vercel.
  const value=env.VERCEL==='1'?stringHeader(req,'x-vercel-forwarded-for')||stringHeader(req,'x-forwarded-for'):req.socket?.remoteAddress||'';
  const first=value.split(',')[0].trim();
  return createHmac('sha256',key).update('hotel-enquiry-ip:'+ (isIP(first)?first:'unknown')).digest('hex');
}
export async function handleGuestEnquiries(req,res,env=process.env,request=fetch){
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');return reply(res,405,{error:'Method not allowed'});
  }
  const base=supabaseUrl(env),key=supabaseServerKey(env),property=env.HOTEL_PROPERTY_ID;
  if(!base||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key||key.length<20||!UUID.test(property||''))
    return reply(res,503,{error:'Guest enquiries are temporarily unavailable. Please try again later.'});
  const headers=supabaseAdminHeaders(key);
  try{
    if(req.method==='GET'){
      const params=new URLSearchParams({id:'eq.'+property,select:'timezone',limit:'1'});
      const upstream=await request(base+'/rest/v1/properties?'+params,{headers,signal:AbortSignal.timeout(10000)});
      if(!upstream.ok)throw new Error('Unavailable');
      const rows=await upstream.json();
      if(!Array.isArray(rows)||!rows.length)throw new Error('Unavailable');
      const timezone=typeof rows[0].timezone==='string'?rows[0].timezone:'Africa/Lagos';
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const part=type=>parts.find(value=>value.type===type)?.value;
      const today=part('year')+'-'+part('month')+'-'+part('day');
      return reply(res,200,{available:true,timezone,today});
    }
    if(!allowedOrigin(req,env))return reply(res,403,{error:'Please submit from the HOTEL website.'});
    if(stringHeader(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')
      return reply(res,415,{error:'Please use the HOTEL enquiry form with JavaScript enabled.'});
    const {requestKey,payload}=parseInput(req.body);
    const response=await request(base+'/rest/v1/rpc/hotel_submit_enquiry',{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({p_property:property,p_request_key:requestKey,p_payload:payload,
        p_rate_key:clientKey(req,env,key),
        p_email_key:createHmac('sha256',key).update('hotel-enquiry-email:'+payload.email).digest('hex')}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(data.message==='Too many enquiries'){
        res.setHeader('Retry-After','3600');return reply(res,429,{error:'Too many requests have been sent. Please try again later.'});
      }
      const messages=new Set(['Choose a date within the next two years','Dining enquiries are currently unavailable',
        'This service is currently unavailable','Request details changed; start a new request']);
      if(messages.has(data.message))return reply(res,422,{error:data.message});
      return reply(res,503,{error:'We could not confirm receipt. Your details are still in the form; please retry.'});
    }
    if(data.recorded!==true||typeof data.reference!=='string'||!/^HREQ-[A-F0-9]{16}$/.test(data.reference))
      throw new Error('Invalid receipt');
    return reply(res,200,{recorded:true,reference:data.reference,status:'received',
      message:'Your request has been received for staff review. Arrangements are not confirmed yet.'});
  }catch(error){
    if(error instanceof InputError)return reply(res,422,{error:error.message});
    return reply(res,503,{error:'We could not confirm receipt. Your details are still in the form; please retry.'});
  }
}
