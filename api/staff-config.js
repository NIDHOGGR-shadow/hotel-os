// Supabase publishable/anon keys are intentionally public; the service-role key never leaves the server.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.SUPABASE_ANON_KEY;
  const propertyId=process.env.HOTEL_PROPERTY_ID;
  if(!url||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key||!UUID.test(propertyId||''))
    return res.status(503).json({error:'Hotel staff access is awaiting its dedicated property configuration.'});
  return res.status(200).json({supabaseUrl:url,anonKey:key,propertyId});
}
