// Public identifiers only. Never send Meta access tokens or Supabase secrets to browsers.
export default function handler(req,res) {
  res.setHeader('Cache-Control','public, max-age=300');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const pixelId = /^\d{5,30}$/.test(process.env.META_PIXEL_ID||'') ? process.env.META_PIXEL_ID : null;
  const ga4Id = /^G-[A-Z0-9]{5,20}$/.test(process.env.GA4_MEASUREMENT_ID||'') ? process.env.GA4_MEASUREMENT_ID : null;
  return res.status(200).json({pixelId,ga4Id,attributionEnabled:process.env.MARKETING_ATTRIBUTION_ENABLED==='true'});
}
