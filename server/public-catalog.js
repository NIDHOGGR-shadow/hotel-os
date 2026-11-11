// Public, read-only room catalog. Uses the same authoritative room_types rates as checkout.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(res,code,data){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(code).json(data);}
export async function handlePublicCatalog(req,res,env=process.env,request=fetch){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
  const base=env.SUPABASE_URL?.replace(/\/$/,'');
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  const property=env.HOTEL_PROPERTY_ID;
  if(!base||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key||key.length<20||!UUID.test(property||''))
    return reply(res,503,{error:'Hotel inventory has not been connected to a property. Rooms cannot be booked yet.'});
  const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
  try{
    const url=base+'/rest/v1/room_types?property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&select=id,name,capacity,nightly_rate_minor&order=nightly_rate_minor.asc&limit=100';
    const response=await request(url,{headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok)return reply(res,503,{error:'Hotel room catalog temporarily unavailable.'});
    const rooms=await response.json();
    if(!Array.isArray(rooms))return reply(res,503,{error:'Unexpected catalog data.'});
    return reply(res,200,{propertyId:property,currency:'NGN',roomTypes:rooms.filter(r=>UUID.test(r.id||'')&&typeof r.name==='string'&&r.name.length<=140&&Number.isSafeInteger(r.nightly_rate_minor)&&r.nightly_rate_minor>0&&Number.isInteger(r.capacity)&&r.capacity>=1).map(r=>({id:r.id,name:r.name,capacity:r.capacity,nightlyRateMinor:r.nightly_rate_minor}))});
  }catch{return reply(res,503,{error:'Could not reach the hotel database.'});}
}
