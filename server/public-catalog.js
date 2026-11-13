import {supabaseUrl,supabaseServerKey,supabaseAdminHeaders} from './supabase-keys.js';
// Public, read-only room catalog. Uses the same authoritative room_types rates as checkout.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(res,code,data){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(code).json(data);}
function catalogImageUrl(base,property,kind,id,path){
  if(typeof path!=='string'||!UUID.test(id))return null;
  const prefix=property+'/'+kind+'/'+id+'/';
  const filename=path.slice(prefix.length);
  if(!path.startsWith(prefix)||!/^[-0-9a-f]{36}\.(?:jpg|jpeg|png|webp)$/i.test(filename))return null;
  return base+'/storage/v1/object/public/hotel-media/'+path.split('/').map(encodeURIComponent).join('/');
}
export async function handlePublicCatalog(req,res,env=process.env,request=fetch){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
  const base=supabaseUrl(env);
  const key=supabaseServerKey(env);
  const property=env.HOTEL_PROPERTY_ID;
  if(!base||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key||key.length<20||!UUID.test(property||''))
    return reply(res,503,{error:'Hotel inventory has not been connected to a property. Rooms cannot be booked yet.'});
  const headers=supabaseAdminHeaders(key);
  try{
    const url=base+'/rest/v1/room_types?property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&select=id,name,capacity,nightly_rate_minor,image_path,rooms(count)&rooms.active=eq.true&order=nightly_rate_minor.asc,name.asc&limit=100';
    const [response,propertyResult,menuResult,photoResult]=await Promise.all([
      request(url,{headers,signal:AbortSignal.timeout(10000)}),
      request(base+'/rest/v1/properties?id=eq.'+encodeURIComponent(property)+'&select=timezone&limit=1',{headers,signal:AbortSignal.timeout(10000)}).then(async response=>response.ok?response.json():[]).catch(()=>[]),
      request(base+'/rest/v1/menu_items?property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&select=id,name,category,description,price_minor,image_path&order=category.asc,name.asc&limit=200',{headers,signal:AbortSignal.timeout(10000)}).then(async response=>response.ok?response.json():null).catch(()=>null),
      request(base+'/rest/v1/catalog_photos?property_id=eq.'+encodeURIComponent(property)+'&select=kind,entity_id,path,caption,position&order=position.asc&limit=1000',{headers,signal:AbortSignal.timeout(10000)}).then(async response=>response.ok?response.json():[]).catch(()=>[])
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
    const verifiedPhotos=Array.isArray(photoResult)?photoResult.filter(row=>
      row&&['room-types','menu-items'].includes(row.kind)&&UUID.test(row.entity_id||'')&&
      typeof row.path==='string'&&typeof row.caption==='string'&&row.caption.length<=120&&
      Number.isInteger(row.position)&&row.position>0
    ): [];
    const galleryFor=(kind,id)=>verifiedPhotos
      .filter(row=>row.kind===kind&&row.entity_id===id)
      .sort((a,b)=>a.position-b.position)
      .slice(0,7)
      .map(row=>({url:catalogImageUrl(base,property,kind,id,row.path),caption:row.caption}))
      .filter(photo=>photo.url!==null);
    const menu=Array.isArray(menuResult)?menuResult.filter(item=>UUID.test(item.id||'')&&typeof item.name==='string'&&item.name.length<=140&&typeof item.category==='string'&&item.category.length<=60&&typeof item.description==='string'&&item.description.length<=360&&Number.isSafeInteger(item.price_minor)&&item.price_minor>0).map(item=>({id:item.id,name:item.name,category:item.category,description:item.description,priceMinor:item.price_minor,imageUrl:catalogImageUrl(base,property,'menu-items',item.id,item.image_path),gallery:galleryFor('menu-items',item.id)})):null;
    return reply(res,200,{propertyId:property,currency:'NGN',today,timeZone,menu,roomTypes:rooms.filter(r=>UUID.test(r.id||'')&&typeof r.name==='string'&&r.name.length<=140&&Number.isSafeInteger(r.nightly_rate_minor)&&r.nightly_rate_minor>0&&Number.isInteger(r.capacity)&&r.capacity>=1).map(r=>({id:r.id,name:r.name,capacity:r.capacity,nightlyRateMinor:r.nightly_rate_minor,roomCount:Number.isSafeInteger(r.rooms?.[0]?.count)?r.rooms[0].count:0,imageUrl:catalogImageUrl(base,property,'room-types',r.id,r.image_path),gallery:galleryFor('room-types',r.id)})).filter(r=>r.roomCount>0)});
  }catch{return reply(res,503,{error:'Could not reach the hotel database.'});}
}
