import {supabaseAdminConfig,supabaseAdminHeaders} from './supabase-admin.js';

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REF=/^hotel-[a-f0-9-]{36}$/;
const ALLOWED_ROLES=new Set(['owner','manager','accountant']);
function reply(res,code,body){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 return res.status(code).json(body);
}
function config(env){
 const db=supabaseAdminConfig(env);
 const property=env.HOTEL_PROPERTY_ID;
 const publicKey=env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
 if(!db||typeof publicKey!=='string'||publicKey.length<20||
    (publicKey.startsWith('sb_')&&!publicKey.startsWith('sb_publishable_'))||
    !UUID.test(property||''))return null;
 return {...db,property,publicKey};
}
const publicHeaders=db=>({
 apikey:db.publicKey,'Content-Type':'application/json',Accept:'application/json'
});
async function supabaseGet(db,path,request){
 const result=await request(db.url+path,{
  method:'GET',headers:supabaseAdminHeaders(db),signal:AbortSignal.timeout(10000)
 });
 if(!result.ok)throw Error('Storage unavailable');
 const value=await result.json();
 if(!Array.isArray(value))throw Error('Unexpected storage response');
 return value;
}
async function roleFor(db,userId,request){
 if(!UUID.test(userId||''))return null;
 const query='/rest/v1/staff_memberships?user_id=eq.'+encodeURIComponent(userId)+
   '&property_id=eq.'+encodeURIComponent(db.property)+'&active=is.true&select=role&limit=1';
 const rows=await supabaseGet(db,query,request);
 return rows.length===1&&ALLOWED_ROLES.has(rows[0]?.role)?rows[0].role:null;
}
export async function handleStaffLogin(req,res,env=process.env,request=fetch){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'Method not allowed'});}
 const db=config(env);
 if(!db)return reply(res,503,{error:'Staff sign-in is not configured.'});
 const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:null;
 const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
 const password=body?.password;
 if(JSON.stringify(body||{}).length>4096||email.length>254||!EMAIL.test(email)||
    typeof password!=='string'||password.length<6||password.length>256)
  return reply(res,422,{error:'Enter a valid staff email and password.'});
 try{
   const result=await request(db.url+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:publicHeaders(db),
    body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000)
   });
   if(result.status===400||result.status===401||result.status===403)
     return reply(res,401,{error:'Unable to sign in with these credentials.'});
   if(!result.ok)throw Error('Auth server unavailable');
   const tokens=await result.json();
   if(typeof tokens?.access_token!=='string'||tokens.access_token.length<30||
      !UUID.test(tokens.user?.id||''))throw Error('Invalid auth result');
   const role=await roleFor(db,tokens.user.id,request);
   if(!role)return reply(res,403,{error:'This account has no finance-report access.'});
   const expires=Number(tokens.expires_in);
   return reply(res,200,{
     accessToken:tokens.access_token,
     expiresIn:Number.isFinite(expires)&&expires>0?Math.min(expires,3600):3600,
     role
   });
 }catch{return reply(res,503,{error:'Staff authentication is temporarily unavailable.'});}
}
async function resolveStaff(req,db,request){
 const header=req.headers?.authorization||req.headers?.Authorization;
 if(typeof header!=='string'||!/^Bearer [A-Za-z0-9._-]{30,4096}$/.test(header))return null;
 const token=header.slice(7);
 const user=await request(db.url+'/auth/v1/user',{
  method:'GET',headers:{...publicHeaders(db),Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(10000)
 });
 if(!user.ok)return null;
 const data=await user.json();
 if(!UUID.test(data?.id||''))return null;
 const role=await roleFor(db,data.id,request);
 return role?{role,userId:data.id}:null;
}
function classify(s,charge){
 if(!charge)return s.status==='verified'?'missing_charge_record':(s.status==='expired'?'expired':s.status==='failed'?'failed':'awaiting_payment');
 if(charge.amount_minor!==s.amount_minor||charge.currency!==s.currency)return 'amount_mismatch';
 if(charge.environment==='test')return 'sandbox_only';
 if(charge.environment!=='live')return 'payment_environment_unknown';
 return s.status==='verified'?'reconciled':'paid_needs_review';
}
/**
 * Server-side authoritative read: payments/reconciliation by property, never
 * derived from a customer's localStorage. Signed-in finance role only.
 */
export async function handleAdminReconciliation(req,res,env=process.env,request=fetch){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return reply(res,405,{error:'Method not allowed'});}
 const db=config(env);
 if(!db)return reply(res,503,{error:'Finance reports are not configured.'});
 try{
   const staff=await resolveStaff(req,db,request);
   if(!staff)return reply(res,403,{error:'Staff finance access required.'});
   const sessions=await supabaseGet(db,'/rest/v1/hotel_checkout_sessions?property_id=eq.'+
     encodeURIComponent(db.property)+'&select=reference,reservation_id,amount_minor,currency,status,paid_at,created_at&order=created_at.desc&limit=100',request);
   if(sessions.length>100||sessions.some(s=>!s||!REF.test(s.reference||'')||
      !Number.isSafeInteger(s.amount_minor)||s.amount_minor<=0||s.currency!=='NGN'))throw Error('Invalid checkout records');
   const refs=sessions.map(s=>s.reference);
   let charges=[];
   if(refs.length){
     const chargeQuery='/rest/v1/paystack_verified_charges?reference=in.('+
       refs.map(encodeURIComponent).join(',')+
       ')&select=reference,amount_minor,currency,environment,paid_at&limit=100';
     charges=await supabaseGet(db,chargeQuery,request);
   }
   const lookup=new Map(charges.filter(c=>typeof c.reference==='string').map(c=>[c.reference,c]));
   const records=sessions.map(s=>{
     const charge=lookup.get(s.reference)||null;
     return {
       reference:s.reference,
       reservationId:UUID.test(s.reservation_id||'')?s.reservation_id:null,
       amountMinor:s.amount_minor,
       currency:s.currency,
       status:s.status,
       paidAt:charge?.paid_at||s.paid_at||null,
       createdAt:s.created_at,
       paymentEnvironment:charge?.environment||null,
       reconciliation:classify(s,charge)
     };
   });
   const summary={
     checkoutCount:records.length,
     reconciledCount:records.filter(r=>r.reconciliation==='reconciled').length,
     reconciledMinor:records.filter(r=>r.reconciliation==='reconciled').reduce((a,r)=>a+r.amountMinor,0),
     attentionCount:records.filter(r=>['missing_charge_record','amount_mismatch','paid_needs_review','payment_environment_unknown'].includes(r.reconciliation)).length
   };
   return reply(res,200,{role:staff.role,currency:'NGN',generatedAt:new Date().toISOString(),summary,records});
 }catch{return reply(res,503,{error:'Unable to read verified reconciliation records right now.'});}
}
