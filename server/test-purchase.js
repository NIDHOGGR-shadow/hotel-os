import {randomUUID} from 'node:crypto';
import {hotelPaymentCallback} from './public-booking.js';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REF=/^hoteldemo-[a-f0-9-]{36}$/;
export const TEST_PRODUCTS=Object.freeze({
 standard:Object.freeze({label:'Standard Room demo',amountMinor:100000}),
 deluxe:Object.freeze({label:'Deluxe Room demo',amountMinor:200000}),
 special:Object.freeze({label:'Special Room demo',amountMinor:300000}),
 presidential:Object.freeze({label:'Presidential Room demo',amountMinor:400000})
});
export function testProductForTransaction(metadata,amount){
 if(metadata?.hotel_os_demo!==true)return null;
 const sku=metadata.demo_sku===undefined?'standard':metadata.demo_sku;
 if(typeof sku!=='string'||!Object.prototype.hasOwnProperty.call(TEST_PRODUCTS,sku))return null;
 const product=TEST_PRODUCTS[sku];
 return amount===product.amountMinor?{sku,...product}:null;
}
function respond(res,status,body) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(body);
}
async function readBody(req) {
  if(req.body && typeof req.body==='object' && !Buffer.isBuffer(req.body)) {
    if(JSON.stringify(req.body).length>4096) throw Error('BODY_TOO_LARGE');
    return req.body;
  }
  if(typeof req.body==='string' && req.body.length<4096) return JSON.parse(req.body);
  throw Error('BAD_REQUEST');
}
/**
 * A fixed-price Paystack TEST-mode catalogue, not a room reservation.
 * Requires explicit enablement, a test secret and a fixed server-side price.
 */
export async function handleTestPurchaseCheckout(req,res,env=process.env,request=fetch) {
  if(req.method!=='POST'&&req.method!=='GET'){res.setHeader('Allow','GET, POST');return respond(res,405,{error:'Method not allowed'});}
  const key=env.PAYSTACK_SECRET_KEY;
  const callback=hotelPaymentCallback(env);
  const enabled=env.HOTEL_TEST_PURCHASE_ENABLED==='true' &&
    typeof key==='string' && /^sk_test_[A-Za-z0-9]+$/.test(key) && !!callback;
  if(req.method==='GET') {
    // This read-only status never reveals the provider key or private settings.
    return respond(res,200,{enabled,mode:'test',currency:'NGN',
      products:Object.entries(TEST_PRODUCTS).map(([sku,item])=>({sku,label:item.label,amountMinor:item.amountMinor})),
      message:enabled?'Paystack sandbox checkout is enabled. Use test payment details only.':
        'Paystack sandbox is not enabled. The sample receipt preview is still available.'});
  }
  if(!enabled) {
    return respond(res,503,{error:'Sandbox checkout is not enabled. No payment has been started.'});
  }
  let body;
  try{body=await readBody(req);}catch{return respond(res,400,{error:'Please enter valid customer details.'});}
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const name=typeof body.name==='string'?body.name.trim():'';
  if(email.length>254||!EMAIL.test(email)||name.length<2||name.length>140) {
    return respond(res,422,{error:'Enter your name and a valid email address.'});
  }
  const sku=body.sku===undefined?'standard':body.sku;
  if(typeof sku!=='string'||!Object.prototype.hasOwnProperty.call(TEST_PRODUCTS,sku))
    return respond(res,422,{error:'Please choose an available test item.'});
  const product=TEST_PRODUCTS[sku];
  const reference='hoteldemo-'+randomUUID();
  if(!REF.test(reference)) return respond(res,503,{error:'Unable to create a sandbox reference.'});
  try{
    const response=await request('https://api.paystack.co/transaction/initialize',{
      method:'POST',
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({
        email, amount:String(product.amountMinor),currency:'NGN',reference,
        callback_url:callback,
        metadata:{hotel_os_demo:true,demo_sku:sku,demo_label:product.label}
      }),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error('Paystack sandbox unavailable');
    const data=await response.json();
    const url=data?.data?.authorization_url;
    if(data?.status!==true||data?.data?.reference!==reference||typeof url!=='string'||
       !/^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9]+\/?$/.test(url))throw Error('Invalid provider response');
    return respond(res,200,{authorizationUrl:url,reference,amountMinor:product.amountMinor,currency:'NGN',sku,itemLabel:product.label,mode:'test'});
  }catch{return respond(res,503,{error:'Unable to start sandbox checkout. No payment link was issued.'});}
}
