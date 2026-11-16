import {randomUUID} from 'node:crypto';

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern=/^[+\d ()\-]{7,25}$/;
const campaignPattern=/^\d{5,30}$/;
const serviceHeaders=key=>({
  apikey:key,
  ...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),
  'Content-Type':'application/json',
  Prefer:'return=representation',
  Accept:'application/json'
});
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const utm=(v,max)=>clean(v,max).replace(/[^a-zA-Z0-9 _.-]/g,'')||null;
const reply=(res,code,data)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(code).json(data);
};
function configuration(env){
  const url=(env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    ready:env.HOTEL_OS_LEADS_ENABLED==='true' &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
      !!key && !!env.TURNSTILE_SECRET_KEY && !!env.TURNSTILE_SITE_KEY,
    url,key,
    siteKey:/^[0-9A-Za-z_-]{10,120}$/.test(env.TURNSTILE_SITE_KEY||'')?env.TURNSTILE_SITE_KEY:null,
    pixelId:env.B2B_AD_TRACKING_ENABLED==='true' && /^\d{5,30}$/.test(env.HOTEL_OS_META_PIXEL_ID||'')?env.HOTEL_OS_META_PIXEL_ID:null,
    ga4Id:/^G-[A-Z0-9]{5,20}$/.test(env.HOTEL_OS_GA4_MEASUREMENT_ID||'')?env.HOTEL_OS_GA4_MEASUREMENT_ID:null
  };
}
function sameOrigin(req){
  const origin=req.headers?.origin,host=req.headers?.['x-forwarded-host']||req.headers?.host;
  if(typeof origin!=='string'||typeof host!=='string')return false;
  try{return new URL(origin).protocol==='https:' && new URL(origin).host===host;}
  catch{return false;}
}
function parseBody(req){
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(raw.length>4096)throw new Error('oversize');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid');
  return body;
}
export async function handleHotelOsLead(req,res,env=process.env,request=fetch){
  const config=configuration(env);
  if(req.method==='GET'){
    return reply(res,200,{ready:config.ready,siteKey:config.ready?config.siteKey:null,
      pixelId:config.pixelId,ga4Id:config.ga4Id});
  }
  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return reply(res,405,{error:'Method not allowed'});
  }
  if(!config.ready||!config.siteKey)return reply(res,503,{error:'Demo requests are not connected yet. Please contact us directly.'});
  if(!sameOrigin(req))return reply(res,403,{error:'Please submit the form from the Hotel OS website.'});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
    return reply(res,415,{error:'Please submit JSON.'});
  let input;
  try{input=parseBody(req);}catch{return reply(res,400,{error:'Invalid request.'});}
  // Honeypot: avoid revealing to automated spam that the submission was discarded.
  if(clean(input.website,200))return reply(res,201,{received:true,reference:randomUUID()});
  const hotelName=clean(input.hotelName,150),contactName=clean(input.contactName,120),
        email=clean(input.email,254).toLowerCase()||null,
        phone=clean(input.phone,25)||null,city=clean(input.city,120)||null,
        message=clean(input.message,1600)||null;
  const count=input.roomCount===''||input.roomCount===null||input.roomCount===undefined?null:Number(input.roomCount);
  const token=clean(input.turnstileToken,4096);
  if(hotelName.length<2||contactName.length<2||!input.consentToContact||
      (email&&!emailPattern.test(email))||(phone&&!phonePattern.test(phone))||
      (!email&&!phone)|| (count!==null&&(!Number.isInteger(count)||count<1||count>10000))||
      token.length<10)
    return reply(res,422,{error:'Please check the hotel name, contact details and consent.'});
  try{
    const verified=await request('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token}),
      signal:AbortSignal.timeout(9000)
    });
    const result=verified.ok?await verified.json():null;
    if(result?.success!==true)return reply(res,422,{error:'Verification expired. Please try again.'});
    const campaign=input.consentToAttribution===true?input.campaign||{}:{};
    const payload={
      hotel_name:hotelName,contact_name:contactName,email,phone,city,
      room_count:count,message,consent_at:new Date().toISOString(),
      utm_source:utm(campaign.source,100),utm_medium:utm(campaign.medium,100),
      utm_campaign:utm(campaign.name,160),
      campaign_id:campaignPattern.test(String(campaign.id||''))?String(campaign.id):null
    };
    const stored=await request(config.url+'/rest/v1/hotel_os_sales_leads?select=id',{
      method:'POST',headers:serviceHeaders(config.key),
      body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
    });
    if(!stored.ok)throw new Error('storage');
    const rows=await stored.json();
    if(!Array.isArray(rows)||!rows[0]?.id)throw new Error('storage');
    return reply(res,201,{received:true,reference:rows[0].id});
  }catch{
    return reply(res,503,{error:'Unable to receive this request right now. Please try again later.'});
  }
}
export default function handler(req,res){return handleHotelOsLead(req,res);}
