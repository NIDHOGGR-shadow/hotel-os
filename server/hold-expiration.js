import {timingSafeEqual} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(body);
}
function isAuthorized(header,secret){
  if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
  const a=Buffer.from(header,'utf8'),b=Buffer.from('Bearer '+secret,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}
/**
 * Cron-friendly, service-role-only expiration endpoint.
 * DO NOT schedule this until HOTEL's Vercel/Supabase project, plan and CRON_SECRET
 * are verified. It cannot mark a payment successful or create a reservation.
 */
export async function handleExpireHolds(req,res,env=process.env,request=fetch){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return reply(res,405,{error:'Method not allowed'});
  }
  if(!env.CRON_SECRET||env.CRON_SECRET.length<32)
    return reply(res,503,{error:'Hold expiration job is not configured'});
  const auth=req.headers?.authorization;
  if(!isAuthorized(Array.isArray(auth)?null:auth,env.CRON_SECRET))
    return reply(res,401,{error:'Unauthorized'});
  const url=env.SUPABASE_URL?.replace(/\/$/,'');
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  const property=env.HOTEL_PROPERTY_ID;
  if(!url||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key||key.length<20||!UUID.test(property||''))
    return reply(res,503,{error:'Hotel property is not configured'});
  try{
    const response=await request(url+'/rest/v1/rpc/hotel_expire_checkout_holds',{
      method:'POST',
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_property:property,p_batch:250}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)return reply(res,503,{error:'Unable to expire holds'});
    const count=await response.json();
    if(!Number.isSafeInteger(count)||count<0||count>250)
      return reply(res,503,{error:'Unexpected expiration result'});
    return reply(res,200,{expiredUnpaidHolds:count});
  }catch{
    return reply(res,503,{error:'Unable to expire holds'});
  }
}
