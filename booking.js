'use strict';

// Guest booking: live inventory can be browsed without an enabled payment gateway.
// No guest contact details are requested until the server is configured to begin checkout.
const form=document.getElementById('availabilityForm');
const results=document.getElementById('availableRooms');
const status=document.getElementById('availabilityStatus');
const payForm=document.getElementById('payForm');
const payStatus=document.getElementById('paymentStatus');
const payButton=document.getElementById('payButton');
const guestFields=document.getElementById('guestContactFields');
const readinessStatus=document.getElementById('checkoutReadinessStatus');
const alternative=document.getElementById('checkoutAlternative');
const checkInInput=form.elements.namedItem('checkIn');
const checkOutInput=form.elements.namedItem('checkOut');
const guestsInput=form.elements.namedItem('guests');
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n/100);
let selected=null;
let selectedQuery=null;
let checkoutReady=false;
let readinessChecked=false;
let requestNumber=0;

function note(target,message,error=false){
 target.replaceChildren();
 const div=document.createElement('div');
 div.className='note'+(error?' error':'');
 div.textContent=message;
 target.appendChild(div);
}

function dateNumber(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
 const date=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===value?date:NaN;
}

function currentSelection(){
 const checkIn=checkInInput.value;
 const checkOut=checkOutInput.value;
 const guests=Number(guestsInput.value);
 const start=dateNumber(checkIn),end=dateNumber(checkOut);
 const today=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<today||end<=start||
    end-start>30*86400000||!Number.isInteger(guests)||guests<1||guests>8)return null;
 return {checkIn,checkOut,guests,nights:Math.round((end-start)/86400000)};
}

function applyCheckoutState(){
 // Server-readiness is informational. The POST endpoint independently enforces
 // the same conditions; changing a browser button can never bypass them.
 guestFields.hidden=!checkoutReady;
 alternative.hidden=checkoutReady;
 payButton.disabled=!checkoutReady;
 payButton.textContent=checkoutReady?'Continue to Paystack →':'Online payment unavailable';
 if(selected){
  note(readinessStatus,checkoutReady?
   'Pay securely with Paystack.':
   readinessChecked?
    'Online checkout is temporarily unavailable. Please try again later.':
    'Checking whether secure checkout is available…',!checkoutReady&&readinessChecked);
 }
}

async function fetchCheckoutReadiness(){
 checkoutReady=false;
 readinessChecked=false;
 applyCheckoutState();
 try{
  const response=await fetch('/api/paystack-checkout',{method:'GET',cache:'no-store'});
  if(!response.ok)throw new Error('Checkout readiness unavailable');
  const data=await response.json();
  checkoutReady=data?.checkoutAvailable===true;
 }catch{
  checkoutReady=false;
 }finally{
  readinessChecked=true;
  applyCheckoutState();
 }
}
fetchCheckoutReadiness();

form.addEventListener('submit',async(event)=>{
 event.preventDefault();
 const token=++requestNumber;
 results.replaceChildren();
 payForm.hidden=true;
 selected=null;
 selectedQuery=null;
 if(!form.reportValidity())return;
 const query=currentSelection();
 if(!query){note(status,'Choose valid dates (up to 30 nights) and a guest count.',true);return}
 selectedQuery=query;
 note(status,'Checking real room availability…');
 try{
  const params=new URLSearchParams({checkIn:query.checkIn,checkOut:query.checkOut,guests:String(query.guests)});
  const response=await fetch('/api/public-availability?'+params,{cache:'no-store'});
  const data=await response.json();
  if(token!==requestNumber)return;
  if(!response.ok){note(status,data.error||'Room availability is temporarily unavailable.',true);return}
  if(!Array.isArray(data.rooms))throw Error('Invalid inventory');
  if(!data.rooms.length){note(status,'No room types available for those dates. Try another date.',true);return}
  const available=data.rooms.filter(room=>room.availableRooms>0 && room.capacity>=query.guests);
  note(status,available.length?
    available.length+' room categories available for your stay. Select a room to see the total.':
    'No rooms are currently free for the selected dates.',!available.length);
  for(const room of data.rooms){
   const card=document.createElement('article');
   card.className='room-option';
   const body=document.createElement('div');
   const title=document.createElement('h3');
   title.textContent=room.name;
   const details=document.createElement('p');
   details.textContent='Up to '+room.capacity+' guests · '+room.availableRooms+' available · '+money(room.nightlyRateMinor)+' / night';
   body.append(title,details);
   const button=document.createElement('button');
   button.className='button';
   button.type='button';
   const canSelect=room.availableRooms>0&&room.capacity>=query.guests;
   button.disabled=!canSelect;
   button.textContent=canSelect?'Select room →':'Unavailable';
   button.addEventListener('click',()=>{
    if(token!==requestNumber)return;
    selected=room;
    payForm.hidden=false;
    document.getElementById('selectedRoom').textContent=room.name;
    document.getElementById('selectedDetails').textContent='Check in '+query.checkIn+' · Check out '+query.checkOut+' · '+query.nights+' night'+(query.nights===1?'':'s');
    document.getElementById('amount').textContent=money(room.nightlyRateMinor*query.nights);
    payStatus.replaceChildren();
    applyCheckoutState();
    payForm.scrollIntoView({behavior:'smooth',block:'start'});
   });
   card.append(body,button);
   results.append(card);
   if(canSelect && new URLSearchParams(location.search).get('roomTypeId')===room.id){button.textContent='Select '+room.name+' →';card.classList.add('preferred-room');}
  }
 }catch{
  if(token===requestNumber)note(status,'Could not reach the live hotel availability service. Please try again.',true);
 }
});

payForm.addEventListener('submit',async(event)=>{
 event.preventDefault();
 if(!checkoutReady){note(payStatus,'Online payment is not enabled for this property. No charge has been made.',true);return}
 if(!selected||!selectedQuery||!payForm.reportValidity())return;
 payButton.disabled=true;
 note(payStatus,'Preparing secure checkout…');
 try{
  const payload={
   checkIn:selectedQuery.checkIn,checkOut:selectedQuery.checkOut,guests:selectedQuery.guests,
   roomTypeId:selected.id,
   guestName:document.getElementById('guestName').value.trim(),
   guestEmail:document.getElementById('guestEmail').value.trim(),
   guestPhone:document.getElementById('guestPhone').value.trim()
  };
  const attribution=window.HotelMarketing?.getAttribution?.();
  if(attribution)payload.attribution=attribution;
  const response=await fetch('/api/paystack-checkout',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload)
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Secure checkout is unavailable.');
  if(!/^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9]+\/?$/.test(data.authorizationUrl||''))
   throw Error('Unexpected payment provider response.');
  location.assign(data.authorizationUrl);
 }catch(error){
  note(payStatus,error.message||'Could not start checkout. No new payment link has been issued.',true);
  payButton.disabled=!checkoutReady;
 }
});

const params=new URLSearchParams(location.search);
if(params.has('checkIn')&&params.has('checkOut')){
 checkInInput.value=params.get('checkIn');
 checkOutInput.value=params.get('checkOut');
 if(params.has('guests'))guestsInput.value=params.get('guests');
}
