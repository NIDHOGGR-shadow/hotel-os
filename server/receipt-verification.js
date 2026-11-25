import {config,resolveStaff} from './staff-reconciliation.js';
import {supabaseAdminHeaders} from './supabase-admin.js';
const REF=/^(hotel-|food-)[a-f0-9-]{36}$/;
const reply=(res,status,body)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(body)};
export async function handleReceiptVerification(req,res,env=process.env,request=fetch){
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Method not allowed'});
 const db=config(env);if(!db)return reply(res,503,{error:'Unavailable'});
 const ref=req.method==='POST'?req.body?.reference:req.query?.reference;if(typeof ref!=='string'||!REF.test(ref))return reply(res,422,{error:'Enter a valid receipt ID'});
 try{const staff=await resolveStaff(req,db,request);if(!staff)return reply(res,403,{error:'Staff access required'});
 const rest=async(path,opts={})=>{const r=await request(db.url+'/rest/v1/'+path,{...opts,headers:{...supabaseAdminHeaders(db),...opts.headers},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Storage unavailable');return r.status===204?null:r.json()};
 const f='property_id=eq.'+encodeURIComponent(db.property)+'&reference=eq.'+encodeURIComponent(ref);
 const food=ref.startsWith('food-');
 const [rows,ledger,used]=await Promise.all([rest((food?'hotel_food_purchases':'hotel_checkout_sessions')+'?'+f+'&limit=1'),rest('paystack_verified_charges?reference=eq.'+encodeURIComponent(ref)+'&limit=1'),rest('hotel_receipt_redemptions?'+f+'&limit=1')]);
 const row=rows?.[0],charge=ledger?.[0];if(!row)return reply(res,404,{error:'Receipt not found'});
 const paid=!!(charge?.environment==='live'&&charge.currency==='NGN'&&charge.amount_minor===row.amount_minor&&(food?row.paid_at:row.status==='verified'));
 let redeemedAt=used?.[0]?.redeemed_at||null;
 // Always verify current provider state before allowing fulfillment, including reversals.
 let verified=false;if(paid&&/^sk_live_/.test(env.PAYSTACK_SECRET_KEY||'')){const p=await request('https://api.paystack.co/transaction/verify/'+encodeURIComponent(ref),{headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY},signal:AbortSignal.timeout(10000)});if(!p.ok)throw Error('Provider unavailable');const data=await p.json();const tx=data.data;verified=data.status===true&&tx?.status==='success'&&tx.reference===ref&&tx.domain==='live'&&tx.currency==='NGN'&&tx.amount===row.amount_minor}
 if(req.method==='POST'){if(!verified)return reply(res,409,{error:'Payment is not verified'});if(redeemedAt)return reply(res,409,{error:'Receipt was already redeemed',redeemedAt});
 const inserted=await rest('hotel_receipt_redemptions?on_conflict=reference', {method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({reference:ref,property_id:db.property,staff_user_id:staff.userId})});if(!inserted?.length)return reply(res,409,{error:'Receipt was already redeemed'});redeemedAt=inserted[0].redeemed_at;}
 return reply(res,200,{reference:ref,verified,redeemedAt,amountMinor:row.amount_minor,kind:food?'food':'room',...(food?{item:row.item_name,quantity:row.quantity,delivery:row.delivery_kind+' '+row.delivery_label}:{reservationId:row.reservation_id})});
 }catch{return reply(res,503,{error:'Unable to verify receipt. Do not fulfill until verified.'})}
}
