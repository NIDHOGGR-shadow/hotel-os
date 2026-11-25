import {randomUUID} from 'node:crypto';
import {supabaseAdminConfig,supabaseAdminHeaders} from './supabase-admin.js';
import {hotelPaymentCallback} from './public-booking.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REF=/^food-[a-f0-9-]{36}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reply=(res,status,body)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');return res.status(status).json(body)};
export function foodConfig(env){const db=supabaseAdminConfig(env);return db&&UUID.test(env.HOTEL_PROPERTY_ID||'')?{...db,property:env.HOTEL_PROPERTY_ID}:null}
export function foodReady(env){return !!(foodConfig(env)&&env.HOTEL_PAYMENTS_ENABLED==='true'&&/^sk_live_[A-Za-z0-9]+$/.test(env.PAYSTACK_SECRET_KEY||'')&&hotelPaymentCallback(env))}
async function rest(db,path,request,options={}){const r=await request(db.url+'/rest/v1/'+path,{...options,headers:{...supabaseAdminHeaders(db),...options.headers},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Storage unavailable');return r.status===204?null:r.json()}
const filter=(db,ref)=>'property_id=eq.'+encodeURIComponent(db.property)+'&reference=eq.'+encodeURIComponent(ref);
export async function findFood(db,ref,request){if(!REF.test(ref||''))return null;const rows=await rest(db,'hotel_food_purchases?'+filter(db,ref)+'&limit=1',request);return rows?.[0]||null}
export function matchesFood(row,tx){return !!(row&&tx?.reference===row.reference&&tx.status==='success'&&tx.domain==='live'&&tx.currency==='NGN'&&Number.isSafeInteger(tx.amount)&&tx.amount===row.amount_minor)}
export async function recordFoodPayment(db,tx,request){const row=await findFood(db,tx.reference,request);if(!matchesFood(row,tx))return false;
 await rest(db,'hotel_food_purchases?'+filter(db,tx.reference)+'&paid_at=is.null',request,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({paid_at:tx.paid_at||new Date().toISOString()})});return true}
export async function handleFood(req,res,env=process.env,request=fetch){
 const db=foodConfig(env),enabled=foodReady(env);
 if(req.method==='GET')return reply(res,200,{checkoutAvailable:enabled});
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
 if(!enabled)return reply(res,503,{error:'Online ordering is temporarily unavailable.'});
 const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>4096||!UUID.test(b.itemId||'')||!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>20||!['room','table'].includes(b.deliveryKind)||typeof b.deliveryLabel!=='string'||! /^[A-Za-z0-9 .-]{1,40}$/.test(b.deliveryLabel.trim())||typeof b.email!=='string'||b.email.length>254||!EMAIL.test(b.email))return reply(res,422,{error:'Check item, quantity, email and delivery location.'});
 try{
 const p=encodeURIComponent(db.property),id=encodeURIComponent(b.itemId);
 const rows=await rest(db,'menu_items?property_id=eq.'+p+'&id=eq.'+id+'&active=eq.true&select=id,name,price_minor&limit=1',request);const item=rows?.[0];
 if(!item||!Number.isSafeInteger(item.price_minor)||item.price_minor<10000)return reply(res,409,{error:'This item is unavailable.'});
 const amount=item.price_minor*b.quantity;if(!Number.isSafeInteger(amount)||amount>100000000)return reply(res,422,{error:'Order total exceeds the online limit.'});
 if(b.quotedAmount!==amount)return reply(res,409,{error:'The price changed. Refresh the menu before paying.'});
 const reference='food-'+randomUUID();
 const row={reference,property_id:db.property,menu_item_id:item.id,item_name:item.name,quantity:b.quantity,unit_minor:item.price_minor,guest_email:b.email.trim().toLowerCase(),delivery_kind:b.deliveryKind,delivery_label:b.deliveryLabel.trim()};
 await rest(db,'hotel_food_purchases',request,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
 const callback=new URL(hotelPaymentCallback(env));callback.pathname='/food-receipt.html';
 const upstream=await request('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:row.guest_email,amount:String(amount),currency:'NGN',reference,callback_url:callback.href}),signal:AbortSignal.timeout(12000)});
 const data=await upstream.json();if(!upstream.ok||data.status!==true||data.data?.reference!==reference||!/^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9]+\/?$/.test(data.data?.authorization_url||''))throw Error('Invalid checkout');
 return reply(res,200,{reference,authorizationUrl:data.data.authorization_url});
 }catch{return reply(res,503,{error:'Could not start checkout. Please try again.'})}
}
export async function handleFoodReceipt(req,res,env=process.env,request=fetch){
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 const ref=req.query?.reference,db=foodConfig(env);if(typeof ref!=='string'||!REF.test(ref))return reply(res,422,{error:'Invalid reference'});if(!db)return reply(res,503,{error:'Unavailable'});
 try{const row=await findFood(db,ref,request);if(!row)return reply(res,404,{error:'Receipt not found'});
 if(!/^sk_live_/.test(env.PAYSTACK_SECRET_KEY||''))return reply(res,503,{error:'Payment verification unavailable'});
 const verified=await request('https://api.paystack.co/transaction/verify/'+encodeURIComponent(ref),{headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY},signal:AbortSignal.timeout(10000)});
 if(verified.status===404)return reply(res,200,{paymentStatus:'pending'});
 if(!verified.ok)throw Error('Provider unavailable');const response=await verified.json(),tx=response.data;
 if(response.status!==true||tx?.reference!==ref)throw Error('Invalid provider result');
 if(['failed','abandoned','reversed'].includes(tx.status))return reply(res,200,{paymentStatus:'failed'});
 if(!matchesFood(row,tx))return reply(res,200,{paymentStatus:'pending'});
 // Provider-verified callback recovery is idempotent; webhook may arrive independently.
 await rest(db,'paystack_verified_charges?on_conflict=reference',request,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({reference:ref,paystack_transaction_id:String(tx.id),amount_minor:tx.amount,currency:'NGN',environment:'live',paid_at:tx.paid_at||null})});
 const charges=await rest(db,'paystack_verified_charges?reference=eq.'+encodeURIComponent(ref)+'&select=amount_minor,currency,environment,paid_at&limit=1',request);const charge=charges?.[0];
 if(charge?.environment!=='live'||charge.currency!=='NGN'||charge.amount_minor!==row.amount_minor)return reply(res,409,{error:'Payment record needs staff review'});
 if(!await recordFoodPayment(db,tx,request))throw Error('Order verification failed');
 const {default:QRCode}=await import('qrcode');const qr=await QRCode.toDataURL(ref,{width:240,margin:2,errorCorrectionLevel:'M'});
 return reply(res,200,{paymentStatus:'verified',receipt:{reference:ref,itemLabel:row.item_name,quantity:row.quantity,amountMinor:row.amount_minor,currency:'NGN',paidAt:tx.paid_at||charge.paid_at||row.paid_at,qr}});
 }catch{return reply(res,503,{error:'Receipt verification unavailable'})}
}
