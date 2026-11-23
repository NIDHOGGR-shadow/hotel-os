/* Guest receipt copies: verified server data only; localStorage is not the ledger. */
(() => {
'use strict';
const KEY='hotel_os_verified_receipts_v1';
const REFERENCE=/^(hotel-|hoteldemo-)[a-f0-9-]{36}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/;
const fmt=minor=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:2}).format(minor/100);
function list(){
 try{
   const all=JSON.parse(localStorage.getItem(KEY)||'[]');
   return Array.isArray(all)?all.filter(r=>r && REFERENCE.test(r.reference) && r.currency==='NGN' &&
      Number.isSafeInteger(r.amountMinor) && r.amountMinor>0 && typeof r.savedAt==='string').slice(0,25):[];
 }catch{return []}
}
function saveVerified(data,ref){
 if(data?.paymentStatus!=='verified'||!data.receipt||!REFERENCE.test(ref||'') ||
    data.receipt.reference!==ref||data.receipt.currency!=='NGN'||
    !Number.isSafeInteger(data.receipt.amountMinor)||data.receipt.amountMinor<=0 ||
    (data.demoPurchase===true && !ref.startsWith('hoteldemo-'))||
    (data.demoPurchase!==true && !ref.startsWith('hotel-')))return null;
 const record={
  reference:ref,
  currency:'NGN',
  amountMinor:data.receipt.amountMinor,
  paidAt:typeof data.receipt.paidAt==='string'?data.receipt.paidAt:null,
  bookingConfirmed:data.demoPurchase===true?false:data.bookingConfirmed===true,
  demoPurchase:data.demoPurchase===true,
  reservationId:typeof data.receipt.reservationId==='string'&&UUID.test(data.receipt.reservationId)?data.receipt.reservationId:null,
  savedAt:new Date().toISOString()
 };
 try {
   const previous=list().filter(x=>x.reference!==ref);
   localStorage.setItem(KEY,JSON.stringify([record,...previous].slice(0,25)));
 }catch{/* Device storage may be unavailable; server remains the source of truth. */}
 return record;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function download(record){
 if(!record||!REFERENCE.test(record.reference)||record.currency!=='NGN'||
    !Number.isSafeInteger(record.amountMinor)||record.amountMinor<=0)return false;
 const date=record.paidAt?new Date(record.paidAt):null;
 const when=date&&!Number.isNaN(date.getTime())?date.toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'}):'Date unavailable';
 const sandbox=record.demoPurchase===true;
 const status=sandbox?'Simulated transaction — no room booked':record.bookingConfirmed===true?'Room reservation confirmed':'Payment verified — reservation not yet confirmed';
 const detail=sandbox?'SANDBOX PAYMENT · NO REAL MONEY':'VERIFIED PAYMENT COPY';
 const documentHtml='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hotel payment receipt</title><style>body{background:#f6f2ed;color:#2f292b;font:15px/1.6 system-ui;padding:25px}main{max-width:550px;margin:20px auto;background:white;border:1px solid #e7ded5;border-radius:15px;padding:35px}h1{font:400 34px Georgia,serif}.stamp{font-size:11px;letter-spacing:2px;color:#904d51;font-weight:750}dl div{padding:14px 0;border-bottom:1px solid #e8e0d8;display:flex;justify-content:space-between;gap:15px}dt{color:#706864}dd{margin:0;text-align:right;overflow-wrap:anywhere;font-weight:650}.small{font-size:12px;color:#776f69}@media print{body{background:white}main{border:0;padding:10px}}</style></head><body><main><div class="stamp">'+detail+'</div><h1>Thank you for choosing Hotel.</h1><p>Your payment details are below. Please keep your reference for support.</p><dl><div><dt>Amount</dt><dd>'+esc(fmt(record.amountMinor))+'</dd></div><div><dt>Reference</dt><dd>'+esc(record.reference)+'</dd></div><div><dt>Payment date</dt><dd>'+esc(when)+'</dd></div><div><dt>Status</dt><dd>'+esc(status)+'</dd></div>'+(record.reservationId?'<div><dt>Reservation ID</dt><dd>'+esc(record.reservationId)+'</dd></div>':'')+'</dl><p class="small">This is a downloaded copy stored on the guest device, not an independently authenticated payment certificate. Confirm the reference with the hotel’s server records before making operational or financial decisions.</p>'+(sandbox?'<p class="small"><strong>TEST ONLY — NOT A REAL PURCHASE.</strong></p>':'')+'</main></body></html>';
 const blob=new Blob([documentHtml],{type:'text/html;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='hotel-receipt-'+record.reference+'.html';a.style.display='none';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
 return true;
}
window.HotelReceipts={list,saveVerified,download,format:fmt};
})();
