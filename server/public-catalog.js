import {supabaseUrl,supabaseServerKey,supabaseAdminHeaders} from './supabase-keys.js';
// Public, read-only room catalog. Uses the same authoritative room_types rates as checkout.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(res,code,data){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(code).json(data);}
export async function handlePublicCatalog(req,res,env=process.env,request=fetch){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
  const base=supabaseUrl(env);
  const key=supabaseServerKey(env);
  const property=env.HOTEL_PROPERTY_ID;
  if(!base||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key||key.length<20||!UUID.test(property||''))
    return reply(res,503,{error:'Hotel inventory has not been connected to a property. Rooms cannot be booked yet.'});
  const headers=supabaseAdminHeaders(key);
  try{
    const url=base+'/rest/v1/room_types?property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&select=id,name,capacity,nightly_rate_minor,rooms(count)&rooms.active=eq.true&order=nightly_rate_minor.asc,name.asc&limit=100';
    const [response,propertyResult,menuResult]=await Promise.all([
      request(url,{headers,signal:AbortSignal.timeout(10000)}),
      request(base+'/rest/v1/properties?id=eq.'+encodeURIComponent(property)+'&select=timezone&limit=1',{headers,signal:AbortSignal.timeout(10000)}).then(async response=>response.ok?response.json():[]).catch(()=>[]),
      request(base+'/rest/v1/menu_items?property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&select=id,name,category,description,price_minor&order=category.asc,name.asc&limit=200',{headers,signal:AbortSignal.timeout(10000)}).then(async response=>response.ok?response.json():null).catch(()=>null)
    ]);
    if(!response.ok)return reply(res,503,{error:'Hotel room catalog temporarily unavailable.'});
    const rooms=await response.json();
    if(!Array.isArray(rooms))return reply(res,503,{error:'Unexpected catalog data.'});
    const timeZone=Array.isArray(propertyResult)&&typeof propertyResult[0]?.timezone==='string'?propertyResult[0].timezone:'Africa/Lagos';
    let today;
    try{
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const part=type=>parts.find(value=>value.type===type)?.value;
      today=part('year')+'-'+part('month')+'-'+part('day');
    }catch{today=new Date().toISOString().slice(0,10);}
    const menu=Array.isArray(menuResult)?menuResult.filter(item=>UUID.test(item.id||'')&&typeof item.name==='string'&&item.name.length<=140&&typeof item.category==='string'&&item.category.length<=60&&typeof item.description==='string'&&item.description.length<=360&&Number.isSafeInteger(item.price_minor)&&item.price_minor>0).map(item=>({id:item.id,name:item.name,category:item.category,description:item.description,priceMinor:item.price_minor})):null;
    return reply(res,200,{propertyId:property,currency:'NGN',today,timeZone,menu,roomTypes:rooms.filter(r=>UUID.test(r.id||'')&&typeof r.name==='string'&&r.name.length<=140&&Number.isSafeInteger(r.nightly_rate_minor)&&r.nightly_rate_minor>0&&Number.isInteger(r.capacity)&&r.capacity>=1).map(r=>({id:r.id,name:r.name,capacity:r.capacity,nightlyRateMinor:r.nightly_rate_minor,roomCount:Number.isSafeInteger(r.rooms?.[0]?.count)?r.rooms[0].count:0})).filter(r=>r.roomCount>0)});
  }catch{return reply(res,503,{error:'Could not reach the hotel database.'});}
}
