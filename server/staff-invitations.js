import {
  supabaseUrl,supabaseServerKey,supabasePublishableKey,supabaseAdminHeaders
} from './supabase-keys.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES=new Set(['manager','front_desk','restaurant','inventory','housekeeping','accountant']);

function reply(res,code,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(code).json(body);
}
function allowedRedirect(env){
  const address=env.HOTEL_PUBLIC_URL||
    (env.VERCEL_URL?'https://'+env.VERCEL_URL:null);
  if(!address||typeof address!=='string')return null;
  try{
    const url=new URL(address);
    if(url.protocol!=='https:'||url.username||url.password||url.port||
       url.pathname!=='/'||url.search||url.hash)return null;
    return url.origin+'/manage.html';
  }catch{return null;}
}

/**
 * Owner-authorized email invitation.
 * A browser never gets the Supabase secret, any Auth admin session or the invite token.
 * An invited user obtains a role only after Supabase verifies their email.
 */
export async function handleStaffInvite(req,res,env=process.env,request=fetch){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'Method not allowed'});}
  const base=supabaseUrl(env),publicKey=supabasePublishableKey(env),secret=supabaseServerKey(env);
  const property=env.HOTEL_PROPERTY_ID,redirect=allowedRedirect(env);
  if(!base||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||
    !publicKey||!secret||secret.length<20||!UUID.test(property||'')||!redirect)
    return reply(res,503,{error:'Staff invitations are not configured.'});
  const auth=req.headers?.authorization;
  if(typeof auth!=='string'||!/^Bearer\s+\S+$/.test(auth)||auth.length>8192)
    return reply(res,401,{error:'Please sign in again.'});
  const bearer=auth.trim();
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>2048)
    return reply(res,422,{error:'Invalid invitation details.'});
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const role=body.role;
  if(email.length>254||!EMAIL.test(email)||!ROLES.has(role))
    return reply(res,422,{error:'Enter a valid email and staff role.'});
  try{
    const user=await request(base+'/auth/v1/user',{
      method:'GET',
      headers:{apikey:publicKey,Authorization:bearer,Accept:'application/json'},
      signal:AbortSignal.timeout(10000)
    });
    if(!user.ok)return reply(res,401,{error:'Your session has expired.'});

    // Critical: authorization is enforced in Postgres by auth.uid() owner role,
    // never by client-provided flags or profile fields.
    const permission=await request(base+'/rest/v1/rpc/hotel_invite_staff',{
      method:'POST',
      headers:{apikey:publicKey,Authorization:bearer,'Content-Type':'application/json'},
      body:JSON.stringify({p_property:property,p_email:email,p_role:role}),
      signal:AbortSignal.timeout(10000)
    });
    if(permission.status===401||permission.status===403)
      return reply(res,403,{error:'Only the HOTEL owner can invite staff.'});
    if(!permission.ok)return reply(res,422,{error:'Staff invitation could not be authorized.'});

    // Send a real Supabase Auth invite, which lets the recipient set a password.
    // The secret is used ONLY server-side; opaque sb_secret_* is not a Bearer JWT.
    let invited;
    try{
      invited=await request(base+'/auth/v1/invite?'+
        new URLSearchParams({redirect_to:redirect}),{
        method:'POST',
        headers:{...supabaseAdminHeaders(secret),'Content-Type':'application/json'},
        body:JSON.stringify({email}),
        signal:AbortSignal.timeout(12000)
      });
    }catch{
      return reply(res,503,{
        invitationSaved:true,emailSent:false,
        error:'Access was approved, but the invitation email could not be sent. Please try again.'
      });
    }
    if(!invited.ok){
      return reply(res,503,{
        invitationSaved:true,emailSent:false,
        error:'Access was approved, but Supabase could not send the invitation. Check email configuration or an existing account.'
      });
    }
    return reply(res,200,{invitationSaved:true,emailSent:true,
      message:'The staff invitation email was sent.'});
  }catch{
    return reply(res,503,{error:'Unable to process staff invitation right now.'});
  }
}
