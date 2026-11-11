import {supabaseUrl,supabaseServerKey,supabasePublishableKey,supabaseAdminHeaders} from './supabase-keys.js';
// Read-only setup diagnostics. Never exposes credentials or charges customers.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(res,code,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(code).json(body);
}
export async function handleReadiness(req,res,env=process.env,request=fetch){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
  const base=supabaseUrl(env);
  const property=env.HOTEL_PROPERTY_ID;
  const key=supabaseServerKey(env);
  const validBase=!!base&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base);
  const dbReady=!!(validBase&&key&&key.length>=20&&UUID.test(property||''));
  const state={
    databaseConfigured:dbReady,
    propertyConnected:false,
    roomTypesPublished:0,
    physicalRoomsReady:0,
    staffAuthenticationConfigured:!!(validBase&&supabasePublishableKey(env)),
    paystackCredentialsPresent:/^sk_(test|live)_/.test(env.PAYSTACK_SECRET_KEY||''),
    onlinePaymentsEnabled:env.HOTEL_PAYMENTS_ENABLED==='true'
  };
  if(!dbReady)return reply(res,200,{...state,notice:'No hotel database connection is configured. Online booking remains unavailable.'});
  try{
    const headers=supabaseAdminHeaders(key);
    const fetchRecords=async(path)=>{
      const response=await request(base+'/rest/v1/'+path,{headers,signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw Error('Database query unavailable');
      const records=await response.json();
      if(!Array.isArray(records))throw Error('Unexpected database response');
      return records;
    };
    const found=await fetchRecords('properties?select=id&id=eq.'+encodeURIComponent(property)+'&limit=1');
    if(!found.length)return reply(res,200,{...state,notice:'Configured HOTEL_PROPERTY_ID does not match a property in this database.'});
    state.propertyConnected=true;
    const [types,rooms]=await Promise.all([
      fetchRecords('room_types?select=id&property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&nightly_rate_minor=gt.0&limit=100'),
      fetchRecords('rooms?select=id&property_id=eq.'+encodeURIComponent(property)+'&active=eq.true&condition=eq.ready&limit=1000')
    ]);
    state.roomTypesPublished=types.length;
    state.physicalRoomsReady=rooms.length;
    return reply(res,200,{...state,notice:types.length&&rooms.length?'Inventory is connected. Confirm availability and payment tests before charging customers.':'Property exists but bookable room categories or ready physical rooms are missing.'});
  }catch{
    return reply(res,200,{...state,notice:'The property connection could not be verified. Check Supabase migrations, project status and deployment variables.'});
  }
}
