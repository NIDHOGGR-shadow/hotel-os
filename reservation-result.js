'use strict';
(()=>{
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),reference=query.get('reference')||query.get('trxref');
  const valid=typeof reference==='string'&&/^[A-Za-z0-9.=-]{1,120}$/.test(reference);
  let timer=null,attempts=0,busy=false;
  function show(state,title,detail){$('statusCard').dataset.state=state;$('heading').textContent=title;$('description').textContent=detail;$('statusSymbol').textContent=state==='confirmed'?'✓':state==='failed'?'!':'…';}
  const date=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  function stayReceipt(){
    try{
      const saved=JSON.parse(sessionStorage.getItem('hotel-last-checkout'));
      if(!saved||saved.reference!==reference||!/^\d{4}-\d{2}-\d{2}$/.test(saved.checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(saved.checkOut))return;
      const rows=[['Room',saved.room],['Check in',date(saved.checkIn)],['Check out',date(saved.checkOut)],['Guests',String(saved.guests)]];
      $('receiptStay').replaceChildren();
      rows.forEach(([label,value])=>{const row=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=String(value);row.append(term,description);$('receiptStay').append(row);});
      $('receiptStay').hidden=false;
    }catch{/* The verified confirmation and reference remain available without browser storage. */}
  }
  if(!valid){
    show('pending','Your next stay awaits.','Choose your dates and a room to begin a reservation. If you have already paid, contact our team with your payment receipt.');
    $('again').hidden=true;$('receiptHelp').hidden=true;
    const link=document.createElement('a');link.href='/book.html';link.className='button';link.textContent='Find a room';$('again').before(link);return;
  }
  $('referenceSection').hidden=false;$('referenceValue').textContent=reference;
  $('contactTeam').href='/contact.html?'+new URLSearchParams({topic:'room_booking',reference});
  $('copyReference').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(reference);$('copyReference').textContent='Reference copied';}catch{$('copyReference').textContent='Select and copy the reference above';}});
  $('printReceipt').addEventListener('click',()=>window.print());
  async function check(){
    if(busy)return;busy=true;clearTimeout(timer);$('again').disabled=true;$('refreshStatus').textContent='Checking with Paystack…';
    try{
      const response=await fetch('/api/payment-status?'+new URLSearchParams({reference}),{cache:'no-store',signal:AbortSignal.timeout(18000)});
      if(!response.ok)throw Error('Status unavailable');
      const data=await response.json();
      if(data.paymentStatus==='verified'&&data.bookingConfirmed===true){
        show('confirmed','We look forward to welcoming you.','Your payment is verified and your room reservation is confirmed. Keep this reference for your stay.');
        $('again').hidden=true;$('printReceipt').hidden=false;$('receiptHelp').textContent='Your room is reserved. For a change or an arrival request, contact our team with the reference above.';stayReceipt();
      }else if(data.paymentStatus==='verified'){
        show('pending','Payment received. Finalising your stay.','Your payment has been verified. Your reservation is still being recorded. Keep this page or contact our team with your reference; there is no need to pay again.');
        schedule();
      }else if(data.paymentStatus==='failed'){
        show('failed','Payment was not completed.','This transaction has not completed successfully. Check your Paystack receipt before starting another payment, or contact our team for help.');
      }else{
        show('pending','Your payment is being processed.','We are waiting for payment confirmation. You can refresh this status or contact our team with your reference.');schedule();
      }
      $('refreshStatus').textContent='Last updated '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date());
    }catch{
      show('pending','We could not refresh your status.','Keep your receipt and payment reference. Check again shortly, or contact our reservations team before making another payment.');$('refreshStatus').textContent='Your reference is saved on this page.';
    }finally{busy=false;$('again').disabled=false;}
  }
  function schedule(){if(attempts++<5)timer=setTimeout(check,5000);}
  $('again').addEventListener('click',check);window.addEventListener('pagehide',()=>clearTimeout(timer));check();
})();
