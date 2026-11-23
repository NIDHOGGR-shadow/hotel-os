/* Shared server-only Supabase admin key handling.
 * New sb_secret_ keys are API keys, NOT JWTs. Never put them into
 * Authorization: Bearer; Supabase rejects that as an invalid JWT.
 * Legacy service_role JWT keys continue to work during migration.
 */
export function supabaseAdminConfig(env = process.env) {
  const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.replace(/\/$/,'') : '';
  const legacy = env.SUPABASE_SERVICE_ROLE_KEY;
  const modern = env.SUPABASE_SECRET_KEY;
  const key = typeof legacy === 'string' && legacy.length > 20 ? legacy : modern;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) ||
      typeof key !== 'string' || key.length <= 20 ||
      (key.startsWith('sb_') && !key.startsWith('sb_secret_'))) return null;
  return {url, key, modern: key.startsWith('sb_secret_')};
}
export function supabaseAdminHeaders(config) {
  if (!config || !config.key) throw new Error('Supabase admin credentials missing');
  return {
    apikey: config.key,
    ...(config.modern ? {} : {Authorization: 'Bearer ' + config.key}),
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}
