'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const form=$('availabilityForm'),results=$('availableRooms'),status=$('availabilityStatus'),payForm=$('payForm'),payStatus=$('paymentStatus'),payButton=$('payButton');
 if(!form||!results||!payForm)return;
 const params=new URLSearchParams(location.search);
 const preferredRoomType=params.get('roomTypeId');
 const format=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n/100);
 const pictures=[
   'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=700&q=78&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=700&q=78&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=700&q=78&auto=format&fit=crop'
 ];
 let query=null,selected=null,searchIndex=0;
 function say(target,message,error=false){
   target.replaceChildren();
   if(!message)return;
   const note=document.createElement('p');note.className='note'+(error?' error':'');note.textContent=message;target.append(note);
 }
 function dateValid(){
   const a=form.elements.namedItem('checkIn')?.value||'',b=form.elements.namedItem('checkOut')?.value||'';
   return /^\d{4}-\d{2}-\d{2}$/.test(a)&&/^\d{4}-\d{2}-\d{2}$/.test(b)&&b>a;
 }
 function nights(a,b){
   return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
 }
 function step(n){
   document.querySelectorAll('.booking-journey span').forEach((el,i)=>el.classList.toggle('active',i===n-1));
 }
 function create(tag,text,css){
   const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(css)node.className=css;return node;
 }
 function chooseRoom(room,image){
   selected=room;payForm.hidden=false;step(3);
   $('selectedRoom').textContent=room.name;
   $('selectedDetails').textContent='Check in '+query.checkIn+' · Check out '+query.checkOut+' · '+query.guests+' guest'+(query.guests===1?'':'s');
   const total=room.nightlyRateMinor*nights(query.checkIn,query.checkOut);
   $('amount').textContent=Number.isSafeInteger(total)?format(total):'See payment summary';
   $('summaryHeading').textContent=room.name;
   $('summaryCopy').textContent='Your '+nights(query.checkIn,query.checkOut)+'-night stay begins '+query.checkIn+'. Confirm guest details below.';
   $('bookingImage').src=image;
   say(payStatus,'');
   payForm.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 }
 function renderAvailable(rooms){
   results.replaceChildren();
   if(!rooms.length){say(status,'No rooms match those dates. Try changing your dates or the number of guests.',true);return;}
   let choosePreferred=null;
   rooms.forEach((room,i)=>{
     if(!room||typeof room.id!=='string'||!Number.isSafeInteger(room.nightlyRateMinor))return;
     const available=room.availableRooms>0&&room.capacity>=query.guests;
     const image=pictures[i%pictures.length];
     const card=create('article',undefined,'room-option');
     const info=create('div',undefined,'option-details');
     const heading=create('h3',room.name);
     const facts=create('p','Up to '+room.capacity+' guests · '+(available?room.availableRooms+' available':'Currently unavailable'));
     const rate=create('strong','From '+format(room.nightlyRateMinor)+' / night');
     const detailsLink=create('a','View room details ↗','text-link');detailsLink.href='/room.html?id='+encodeURIComponent(room.id);
     info.append(heading,facts,rate,detailsLink);
     const actions=create('div',undefined,'option-actions');
     const photo=create('img');photo.src=image;photo.alt='Room photograph for illustration';photo.loading='lazy';
     const button=create('button',available?'Choose this room ↗':'Unavailable','button');button.type='button';button.className='button';button.disabled=!available;
     button.addEventListener('click',()=>chooseRoom(room,image));
     actions.append(button);card.append(photo,info,actions);results.append(card);
     if(room.id===preferredRoomType&&available)choosePreferred=()=>chooseRoom(room,image);
   });
   if(choosePreferred)choosePreferred();
   else if(results.children.length&&!selected){step(2);results.scrollIntoView({behavior:'smooth',block:'start'});}
 }
 async function search(e){
   if(e)e.preventDefault();
   if(!form.reportValidity()||!dateValid()){say(status,'Please choose a checkout date after your check-in date.',true);return;}
   searchIndex+=1;const index=searchIndex;
   query={checkIn:form.elements.namedItem('checkIn').value,checkOut:form.elements.namedItem('checkOut').value,guests:Number(form.elements.namedItem('guests').value)};
   selected=null;payForm.hidden=true;results.replaceChildren();step(1);
   const button=$('checkAvailability');button.disabled=true;button.textContent='Searching rooms…';
   say(status,'Looking for rooms on your selected dates…');
   try{
     const response=await fetch('/api/public-availability?'+new URLSearchParams(query),{cache:'no-store'});
     const data=await response.json().catch(()=>({}));
     if(index!==searchIndex)return;
     if(!response.ok){
       say(status,response.status===422?'Please check your dates and guest count.':'Online room search is temporarily unavailable. Please try again later.',true);return;
     }
     if(!Array.isArray(data.rooms)){say(status,'Rooms cannot be displayed right now. Please try again.',true);return;}
     say(status,'');renderAvailable(data.rooms);
   }catch{if(index===searchIndex)say(status,'We could not complete the room search. Please try again shortly.',true);}
   finally{if(index===searchIndex){button.disabled=false;button.textContent='Find available rooms ↗';}}
 }
 form.addEventListener('submit',search);
 payForm.addEventListener('submit',async e=>{
   e.preventDefault();
   if(!selected||!query||!payForm.reportValidity())return;
   payButton.disabled=true;payButton.textContent='Preparing secure checkout…';say(payStatus,'Preparing your secure payment link…');
   try{
     const payload={
       ...query,roomTypeId:selected.id,guestName:$('guestName').value.trim(),
       guestEmail:$('guestEmail').value.trim(),guestPhone:$('guestPhone').value.trim()
     };
     const response=await fetch('/api/paystack-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(response.status===409?'That room has just become unavailable. Please check your dates again.':'Checkout is temporarily unavailable. No payment was taken.');
     const url=new URL(data.authorizationUrl);
     if(url.origin!=='https://checkout.paystack.com')throw Error('Secure checkout could not be opened.');
     location.assign(url.href);
   }catch(error){
     say(payStatus,error.message||'Could not open payment. No charge was made.',true);
     payButton.disabled=false;payButton.textContent='Continue to secure payment ↗';
   }
 });
 if(params.has('checkIn')&&params.has('checkOut')){
   form.elements.namedItem('checkIn').value=params.get('checkIn');
   form.elements.namedItem('checkOut').value=params.get('checkOut');
 }
 if(params.has('guests')){
   const guest=Number(params.get('guests'));
   if(Number.isInteger(guest)&&guest>=1&&guest<=6)form.elements.namedItem('guests').value=String(guest);
 }
 if(preferredRoomType&&dateValid())search();
})();
