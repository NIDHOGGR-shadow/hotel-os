const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function htmlEscape(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
/**
 * Confirmation/receipt email, dispatched ONLY after the verified payment and
 * booking reconciliation have succeeded. The provider key and verified sender
 * are server-only. A provider 2xx is acceptance, not proof of inbox delivery.
 */
export async function sendBookingReceipt({reference,amountMinor,to,isDemo=false},env=process.env,request=fetch){
  if(!env.RESEND_API_KEY||!env.HOTEL_BOOKING_EMAIL_FROM)return 'not_configured';
  const from=env.HOTEL_BOOKING_EMAIL_FROM;
  if(!/^re_[A-Za-z0-9_-]+$/.test(env.RESEND_API_KEY)||
     typeof from!=='string'||from.length>254||!EMAIL.test(from)||
     typeof to!=='string'||to.length>254||!EMAIL.test(to)||
     !/^(hotel-|hoteldemo-)[a-f0-9-]{36}$/.test(reference||'')||
     !Number.isSafeInteger(amountMinor)||amountMinor<=0)return 'invalid_details';
  if(isDemo && (!reference.startsWith('hoteldemo-')||![100000,200000,300000,400000].includes(amountMinor)))return 'invalid_details';
  if(!isDemo && !reference.startsWith('hotel-'))return 'invalid_details';
  const amount=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(amountMinor/100);
  const subject=isDemo?'Your Hotel OS test payment receipt':'Your hotel reservation is confirmed';
  const intro=isDemo?
    'Thank you for trying Hotel OS. Your simulated test payment was verified and recorded. No real money was collected, and no hotel room was reserved.':
    'Thank you for choosing to stay with us. Your payment has been verified and your hotel reservation is confirmed. We look forward to welcoming you.';
  const label=isDemo?'Test payment':'Payment';
  const plain='Hello,\n\n'+intro+'\n\n'+label+' amount: '+amount+
    '\nPayment reference: '+reference+'\n\nPlease keep this reference for your records.\n\nWarm regards,\nThe Hotel team';
  const html='<!doctype html><html><body style="margin:0;background:#f7f4f0;font-family:Arial,sans-serif;color:#292527"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e5dbd0;border-radius:16px">'+
    '<div style="font-family:Georgia,serif;font-size:29px">Hotel.</div>'+
    '<p style="color:#946b59;font-size:12px;letter-spacing:1px;margin-top:36px">'+(isDemo?'SANDBOX RECEIPT':'BOOKING CONFIRMED')+'</p>'+
    '<h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px">'+(isDemo?'Your test payment worked.':'We look forward to welcoming you.')+'</h1>'+
    '<p style="line-height:1.8;color:#625a56">'+htmlEscape(intro)+'</p>'+
    '<div style="padding:19px;background:#f7f1eb;border-radius:12px;margin-top:25px">'+
    '<div style="font-size:12px;color:#6d635c">'+label+' amount</div><strong style="display:block;font-size:27px;margin-top:4px">'+htmlEscape(amount)+'</strong>'+
    '<div style="font-size:12px;color:#6d635c;margin-top:20px">Payment reference</div><span style="font-size:12px;overflow-wrap:anywhere">'+htmlEscape(reference)+'</span>'+
    '</div><p style="font-size:13px;color:#746e69;margin-top:24px">Keep this email as your payment record.</p>'+
    '<p style="font-size:14px;line-height:1.6">Warm regards,<br>The Hotel team</p></div></body></html>';
  try{
    const response=await request('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',
        'Idempotency-Key':'hotel-receipt/'+reference},
      body:JSON.stringify({from,to:[to],subject,html,text:plain}),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)return 'failed';
    const result=await response.json().catch(()=>null);
    return typeof result?.id==='string'&&result.id.length>0?'accepted':'failed';
  }catch{return 'failed';}
}
