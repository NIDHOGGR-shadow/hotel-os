// Server-only Supabase credentials. Never return the secret key in JSON responses.
export const supabaseUrl=env=>(env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/,'');
export const supabaseServerKey=env=>env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
export const supabasePublishableKey=env=>env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;

// Supabase's new sb_secret_* API keys are NOT JWTs. Sending one as a Bearer
// token produces an "Invalid JWT" error; put it ONLY in the apikey header.
// Legacy service_role JWTs are supported during migration.
export function supabaseAdminHeaders(key){
  const headers={apikey:key,Accept:'application/json'};
  if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
  return headers;
}
