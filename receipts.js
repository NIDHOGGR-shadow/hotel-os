(() => {
'use strict';
const listEl=document.getElementById('receiptList');
const status=document.getElementById('receiptStatus');
function el(tag,cls,text) {
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
}
function label(r) {
 if(r.demoPurchase)return 'Sandbox test — no room reserved';
 return r.bookingConfirmed?'Reservation confirmed':'Verified payment · booking processing';
}
function render(){
 listEl.replaceChildren();
 const all=window.HotelReceipts?.list?.()||[];
 if(!all.length){
  const empty=el('section','receipt-empty');
  empty.append(el('h2','', 'No saved receipts yet.'),el('p','', 'When a payment is verified, your receipt can be saved here on this device.'));
  const link=el('a','button','Check room availability →');link.href='/book.html';
  empty.append(link);listEl.append(empty);
  return;
 }
 for(const r of all){
   const card=el('article','receipt-card');
   const head=el('div','receipt-head');
   head.append(el('strong','',window.HotelReceipts.format(r.amountMinor)),el('span','',r.demoPurchase?'Test payment receipt':'Payment receipt'));
   const meta=el('div','receipt-meta');
   meta.append(el('span','', 'Reference: '+r.reference),
     el('span','', 'Payment date: '+(r.paidAt||'Not provided')));
   const actions=el('div','receipt-actions');
   const download=el('button','', 'Download copy');
   download.type='button';
   download.addEventListener('click',()=>window.HotelReceipts.download(r));
   const check=el('button','','Verify with hotel');
   check.type='button';
   const message=el('div','receipt-state',label(r));
   check.addEventListener('click',async()=>{
     check.disabled=true;message.textContent='Checking the server…';
     try{
       const response=await fetch('/api/payment-status?reference='+encodeURIComponent(r.reference),{cache:'no-store'});
       if(!response.ok)throw Error('Server verification unavailable');
       const data=await response.json();
       if(data.paymentStatus==='verified' && data.receipt){
         window.HotelReceipts.saveVerified(data,r.reference);
         message.textContent=data.demoPurchase?'Verified Paystack sandbox payment':data.bookingConfirmed?'Verified payment and reservation':'Payment verified; booking awaiting confirmation';
         render();
       }else if(data.paymentStatus==='failed')message.textContent='Provider reports payment was not completed. Contact the hotel.';
       else message.textContent='Payment or booking confirmation still pending. Contact the hotel before paying again.';
     }catch{message.textContent='Unable to reach the server. The saved local copy remains unverified.'}
     finally{check.disabled=false}
   });
   const ref=el('a','','Open payment status');
   ref.href='/payment-callback.html?reference='+encodeURIComponent(r.reference);
   actions.append(download,check,ref);card.append(head,meta,message,actions);listEl.append(card);
 }
}
const recoverForm=document.getElementById('recoverReceiptForm');
const recoverButton=document.getElementById('recoverButton');
const recoverInput=document.getElementById('recoverReference');
const recoverStatus=document.getElementById('recoverStatus');
const VALID_REF=/^(hotel|hoteldemo)-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const recoveredDownload=document.createElement('button');
recoveredDownload.type='button';
recoveredDownload.textContent='Download recovered receipt';
recoveredDownload.hidden=true;
recoverForm.append(recoveredDownload);
let latestRecovered=null;
recoveredDownload.addEventListener('click',()=>{
 if(latestRecovered)window.HotelReceipts.download(latestRecovered);
});
recoverForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const reference=recoverInput.value.trim();
 latestRecovered=null;recoveredDownload.hidden=true;
 if(!VALID_REF.test(reference)){
   recoverStatus.textContent='Enter a valid Hotel OS payment reference beginning with hotel- or hoteldemo-.';
   return;
 }
 recoverButton.disabled=true;recoverStatus.textContent='Checking Paystack and the hotel payment record…';
 try{
   const response=await fetch('/api/payment-status?reference='+encodeURIComponent(reference),{cache:'no-store'});
   if(!response.ok)throw new Error('The payment verification service is unavailable. Please try again later.');
   const result=await response.json();
   if(result.paymentStatus==='failed'){
     recoverStatus.textContent='This payment was not completed. A verified receipt cannot be recovered.';
   }else if(result.paymentStatus!=='verified'){
     recoverStatus.textContent='Payment is still pending. Please check Paystack or contact the hotel before paying again.';
   }else if(!result.receipt){
     recoverStatus.textContent='Paystack confirmed a charge, but a matching verified receipt is not yet on record. Please contact the hotel with this reference.';
   }else{
     const recovered=window.HotelReceipts?.saveVerified?.(result,reference);
     if(!recovered)throw new Error('The returned receipt could not be matched to this reference.');
     latestRecovered=recovered;
     recoveredDownload.hidden=false;
     recoverStatus.textContent=result.demoPurchase?
       'Verified sandbox receipt recovered. This is not a real booking.':
       result.bookingConfirmed?
         'Verified payment and confirmed reservation recovered.':
         'Verified payment recovered. Your room reservation is still processing.';
     render();
   }
 }catch(error){
   recoverStatus.textContent=error.message||'Unable to retrieve a verified receipt. No receipt has been created.';
 }finally{recoverButton.disabled=false;}
});
render();
})();