'use strict';
(()=>{
  const $=id=>document.getElementById(id),guest=window.HotelGuest;
  const form=$('availabilityForm'),results=$('availableRooms'),status=$('availabilityStatus'),payForm=$('payForm'),payStatus=$('paymentStatus'),payButton=$('payButton');
  if(!form||!results||!payForm||!guest)return;
  const params=new URLSearchParams(location.search),preferred=params.get('roomTypeId');
  const pictures=[
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=700&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=700&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=700&q=80&auto=format&fit=crop'
  ];
  let query=null,selected=null,searchIndex=0,controller=null,paying=false,hasSearched=false;
  const create=(tag,text,css)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(css)node.className=css;return node;};
  const nights=span=>Math.round((Date.parse(span.checkOut+'T00:00:00Z')-Date.parse(span.checkIn+'T00:00:00Z'))/86400000);
  const same=(a,b)=>a&&b&&a.checkIn===b.checkIn&&a.checkOut===b.checkOut&&a.guests===b.guests;
  const smooth=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  function say(target,message,error=false){
    target.replaceChildren();if(!message)return;
    target.append(create('p',message,'note'+(error?' error':'')));
  }
  function help(target){const link=create('a','Contact reservations','text-link');link.href='/contact.html?topic=room_booking';target.append(link);}
  function step(number){
    document.querySelectorAll('.booking-journey li').forEach((item,index)=>{
      item.classList.toggle('active',index===number-1);item.classList.toggle('done',index<number-1);
      if(index===number-1)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    });
  }
  function summary(span,room=null){
    $('summaryHeading').textContent=room?room.name:'Your stay at HOTEL';
    $('summaryRoom').textContent=room?room.name:'Choose a room';$('summaryTotal').textContent='—';
    $('summaryBreakdown').textContent='Select a room to see your full stay price.';
    if(!guest.valid(span)){
      $('summaryCheckIn').textContent=guest.formatDate(span?.checkIn)||'Choose a date';$('summaryCheckOut').textContent=guest.formatDate(span?.checkOut)||'Choose a date';$('summaryNights').textContent='—';return;
    }
    $('summaryCheckIn').textContent=guest.formatDate(span.checkIn);$('summaryCheckOut').textContent=guest.formatDate(span.checkOut);
    $('summaryGuests').textContent=span.guests+' guest'+(span.guests===1?'':'s');$('summaryNights').textContent=nights(span)+' night'+(nights(span)===1?'':'s');
    $('summaryHeading').textContent=room?room.name:'Your stay at HOTEL';
    $('summaryRoom').textContent=room?room.name:'Choose a room';
    const total=room?room.nightlyRateMinor*nights(span):null;
    $('summaryTotal').textContent=Number.isSafeInteger(total)?guest.price(total):'—';
    $('summaryBreakdown').textContent=room?guest.price(room.nightlyRateMinor)+' × '+nights(span)+' night'+(nights(span)===1?'':'s'):'Select a room to see your full stay price.';
  }
  function chooseRoom(room,image){
    if(!query||!same(guest.readForm(form),query)||paying)return;
    selected=room;payForm.hidden=false;payButton.disabled=false;step(3);summary(query,room);
    $('selectedRoom').textContent=room.name;
    $('selectedDetails').textContent=guest.formatDate(query.checkIn)+' – '+guest.formatDate(query.checkOut)+' · '+query.guests+' guest'+(query.guests===1?'':'s');
    $('amount').textContent=guest.price(room.nightlyRateMinor*nights(query));$('bookingImage').src=image;
    results.querySelectorAll('.room-option').forEach(card=>{
      const active=card.dataset.roomId===room.id;card.classList.toggle('selected',active);
      const button=card.querySelector('button');if(button&&!button.disabled){button.textContent=active?'Selected ✓':'Choose this room';button.setAttribute('aria-pressed',String(active));}
    });
    say(payStatus,'');payForm.scrollIntoView({behavior:smooth(),block:'start'});$('selectedRoom').focus({preventScroll:true});
  }
  function invalidate(){
    if(paying)return;
    const span=guest.readForm(form);
    if(query&&same(span,query))return;
    const hadQuery=!!query;
    searchIndex++;controller?.abort();query=null;selected=null;payForm.hidden=true;payButton.disabled=true;results.replaceChildren();results.setAttribute('aria-busy','false');step(1);
    $('checkAvailability').disabled=false;$('checkAvailability').textContent='Find available rooms';
    summary(span);say(payStatus,'');
    if(hadQuery)say(status,'Dates or guests changed. Find available rooms to update your stay.');
  }
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  function renderAvailable(rows){
    results.replaceChildren();
    const rooms=rows.filter(room=>room&&typeof room.id==='string'&&typeof room.name==='string'&&Number.isSafeInteger(room.nightlyRateMinor)&&room.nightlyRateMinor>0&&Number.isInteger(room.capacity)&&Number.isInteger(room.availableRooms)&&room.availableRooms>=0&&Number.isSafeInteger(room.nightlyRateMinor*nights(query)));
    const available=rooms.filter(room=>room.availableRooms>0&&room.capacity>=query.guests);
    if(!available.length){
      say(status,'No rooms are available for this stay. Choose different dates or contact reservations for help.');help(status);
    }
    if(!rooms.length)return;
    const heading=create('div',undefined,'booking-results-heading');
    const title=create('h2',available.length?available.length+' room '+(available.length===1?'option':'options')+' for your stay':'Explore other dates');title.tabIndex=-1;
    heading.append(title,create('p',nights(query)+' night'+(nights(query)===1?'':'s')+' · '+guest.formatDate(query.checkIn)+' – '+guest.formatDate(query.checkOut)));results.append(heading);
    let preferredOption=null;
    rooms.forEach((room,index)=>{
      const isAvailable=room.availableRooms>0&&room.capacity>=query.guests,image=pictures[index%pictures.length];
      const card=create('article',undefined,'room-option');card.dataset.roomId=room.id;
      const photo=create('img');photo.src=image;photo.alt='Room style photograph';photo.loading='lazy';
      const info=create('div',undefined,'option-details');info.append(create('h3',room.name),create('p','Up to '+room.capacity+' guests · '+(isAvailable?'Available for your dates':'Unavailable for these dates')));
      const rate=create('strong',guest.price(room.nightlyRateMinor*nights(query)));rate.append(create('span',' for '+nights(query)+' night'+(nights(query)===1?'':'s'),'rate-unit'));info.append(rate);
      const actions=create('div',undefined,'option-actions'),details=create('a','Room details','text-link');details.href=guest.url('/room.html',{id:room.id});
      const button=create('button',isAvailable?'Choose this room':'Unavailable','button');button.type='button';button.disabled=!isAvailable;button.setAttribute('aria-label',(isAvailable?'Choose ':'Unavailable: ')+room.name);button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>chooseRoom(room,image));actions.append(button,details);card.append(photo,info,actions);results.append(card);
      if(room.id===preferred&&isAvailable)preferredOption=()=>chooseRoom(room,image);
    });
    if(preferredOption)preferredOption();
    else if(available.length){step(2);title.focus({preventScroll:true});results.scrollIntoView({behavior:smooth(),block:'start'});}
  }
  async function search(event){
    event?.preventDefault();
    if(paying)return;
    if(!form.reportValidity()||!guest.valid(guest.readForm(form))){say(status,'Choose a stay of 1 to 30 nights and up to 8 guests.',true);return;}
    hasSearched=true;
    const index=++searchIndex;controller?.abort();const activeController=new AbortController();controller=activeController;
    query={...guest.readForm(form)};guest.remember(query);selected=null;payForm.hidden=true;payButton.disabled=true;results.replaceChildren();results.setAttribute('aria-busy','true');step(1);summary(query);
    const url=new URL(location.href);for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));history.replaceState(null,'',url.pathname+url.search);
    const button=$('checkAvailability');button.disabled=true;button.textContent='Finding your room…';say(status,'Checking availability for your dates…');
    const timeout=setTimeout(()=>activeController.abort(),18000);
    try{
      const response=await fetch('/api/public-availability?'+new URLSearchParams(query),{cache:'no-store',signal:activeController.signal});
      const data=await response.json().catch(()=>({}));if(index!==searchIndex)return;
      if(!response.ok)throw Error(response.status===422?'Please check your dates and number of guests.':'We could not load rooms right now. Please try again or contact reservations.');
      if(!Array.isArray(data.rooms))throw Error('We could not load rooms right now. Please try again.');
      say(status,'');renderAvailable(data.rooms);
    }catch(error){
      if(index===searchIndex){say(status,error.name==='AbortError'?'The search took too long. Please try again.':error.message||'Please try again.',true);help(status);}
    }finally{clearTimeout(timeout);if(index===searchIndex){button.disabled=false;button.textContent='Find available rooms';results.setAttribute('aria-busy','false');}}
  }
  form.addEventListener('submit',search);
  $('changeRoom')?.addEventListener('click',()=>{step(2);results.scrollIntoView({behavior:smooth(),block:'start'});results.querySelector('button:not(:disabled)')?.focus({preventScroll:true});});
  payForm.addEventListener('submit',async event=>{
    event.preventDefault();if(paying||!payForm.reportValidity())return;
    if(!selected||!query||!same(query,guest.readForm(form))){invalidate();say(status,'Please find available rooms for your updated dates.',true);form.scrollIntoView({behavior:smooth()});return;}
    paying=true;payButton.disabled=true;payButton.textContent='Opening secure checkout…';say(payStatus,'Preparing your full-payment checkout…');
    const stayControls=Array.from(form.querySelectorAll('input,select,button'));stayControls.forEach(control=>control.disabled=true);
    const choiceControls=Array.from(results.querySelectorAll('button:not(:disabled)'));choiceControls.forEach(control=>control.disabled=true);$('changeRoom').disabled=true;
    try{
      const payload={...query,roomTypeId:selected.id,guestName:$('guestName').value.trim(),guestEmail:$('guestEmail').value.trim(),guestPhone:$('guestPhone').value.trim()};
      const response=await fetch('/api/paystack-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(response.status===409?'This room was just taken. Please search again to choose another room.':response.status===422?'Please check your dates and contact details.':'We could not open checkout. Please retry or contact reservations.');
      const target=new URL(data.authorizationUrl);
      if(target.origin!=='https://checkout.paystack.com'||!/^\/\w+\/?$/.test(target.pathname))throw Error('Secure checkout could not be opened. Please retry.');
      try{sessionStorage.setItem('hotel-last-checkout',JSON.stringify({reference:data.reference,checkIn:query.checkIn,checkOut:query.checkOut,guests:query.guests,room:selected.name}));}catch{/* Receipt reference is also returned by Paystack. */}
      location.assign(target.href);
    }catch(error){say(payStatus,error.name==='TimeoutError'?'Checkout took too long to respond. If you have already paid, check your receipt before trying again.':error.message||'Checkout could not be opened. Please retry.',true);help(payStatus);}
    finally{paying=false;payButton.disabled=false;payButton.textContent='Continue to secure payment';stayControls.forEach(control=>control.disabled=false);choiceControls.forEach(control=>control.disabled=false);$('changeRoom').disabled=false;}
  });
  summary(guest.readForm(form));
  guest.ready.then(()=>{
    summary(guest.readForm(form));
    if(!hasSearched&&!form.dataset.edited&&(params.has('checkIn')&&params.has('checkOut')||guest.stay())&&guest.valid(guest.readForm(form)))search();
  });
})();
