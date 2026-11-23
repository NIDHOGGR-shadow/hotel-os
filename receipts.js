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
render();
})();