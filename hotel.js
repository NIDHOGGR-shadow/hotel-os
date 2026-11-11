'use strict';
// Shared guest navigation and stay details. Contact information is never stored here.
(()=>{
  const DAY=86400000,KEY='hotel-guest-stay';
  const query=new URLSearchParams(location.search);
  const forms=Array.from(document.querySelectorAll('#homeBooking,#roomStayForm,#availabilityForm,#collectionStay'));
  const addDays=(date,count)=>new Date(Date.parse(date+'T12:00:00Z')+count*DAY).toISOString().slice(0,10);
  const dateOK=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const todayIn=zone=>{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=type=>parts.find(p=>p.type===type)?.value;
    return part('year')+'-'+part('month')+'-'+part('day');
  };
  let today=todayIn('Africa/Lagos'),stay=null;
  const valid=value=>value&&dateOK(value.checkIn)&&dateOK(value.checkOut)&&value.checkIn>=today&&value.checkOut>value.checkIn&&value.checkOut<=addDays(value.checkIn,30)&&Number.isInteger(Number(value.guests))&&Number(value.guests)>=1&&Number(value.guests)<=8;
  const readForm=form=>({checkIn:form.elements.namedItem('checkIn')?.value,checkOut:form.elements.namedItem('checkOut')?.value,guests:Number(form.elements.namedItem('guests')?.value)});
  const fromURL={checkIn:query.get('checkIn'),checkOut:query.get('checkOut'),guests:Number(query.get('guests')||2)};
  if(valid(fromURL))stay=fromURL;
  if(!stay)try{const saved=JSON.parse(sessionStorage.getItem(KEY));if(valid(saved))stay=saved;}catch{/* Storage can be unavailable in private browsing. */}
  const formatDate=value=>dateOK(value)?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'';
  const url=(path,extra={})=>{
    const target=new URL(path,location.origin);
    if(stay)for(const [key,value] of Object.entries(stay))target.searchParams.set(key,String(value));
    for(const [key,value] of Object.entries(extra))if(value!==null&&value!==undefined)target.searchParams.set(key,String(value));
    return target.pathname+target.search+target.hash;
  };
  function decorateLinks(){
    document.querySelectorAll('a[href]').forEach(link=>{
      const target=new URL(link.getAttribute('href'),location.origin);
      if(target.origin===location.origin&&['/book.html','/rooms.html','/room.html'].includes(target.pathname))link.href=url(target.pathname+target.search+target.hash);
    });
  }
  function remember(value){
    if(!valid(value))return false;
    stay={checkIn:value.checkIn,checkOut:value.checkOut,guests:Number(value.guests)};
    try{sessionStorage.setItem(KEY,JSON.stringify(stay));}catch{/* Dates remain in the link. */}
    decorateLinks();return true;
  }
  function limits(form){
    const arrival=form.elements.namedItem('checkIn'),departure=form.elements.namedItem('checkOut');
    if(!arrival||!departure)return;
    arrival.min=today;
    departure.min=addDays(dateOK(arrival.value)?arrival.value:today,1);
    departure.max=addDays(dateOK(arrival.value)?arrival.value:today,30);
  }
  for(const form of forms){
    const arrival=form.elements.namedItem('checkIn'),departure=form.elements.namedItem('checkOut'),guests=form.elements.namedItem('guests');
    if(!arrival||!departure||!guests)continue;
    const initial=stay||{checkIn:today,checkOut:addDays(today,1),guests:2};
    arrival.value=initial.checkIn;departure.value=initial.checkOut;guests.value=String(initial.guests);limits(form);
    form.addEventListener('input',()=>{form.dataset.edited='true';departure.setCustomValidity('');});
    form.addEventListener('change',event=>{
      if(event.target===arrival&&dateOK(arrival.value)&&(!dateOK(departure.value)||departure.value<=arrival.value||departure.value>addDays(arrival.value,30)))departure.value=addDays(arrival.value,1);
      departure.setCustomValidity('');limits(form);
      remember(readForm(form));
    });
    form.addEventListener('submit',event=>{
      if(!valid(readForm(form))){
        event.preventDefault();event.stopImmediatePropagation();
        departure.setCustomValidity('Choose a stay of 1 to 30 nights, with checkout after check-in.');departure.reportValidity();return;
      }
      remember(readForm(form));
    });
  }
  const catalog=fetch('/api/public-catalog',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async response=>{
    if(!response.ok)throw Error('Room collection is unavailable.');
    const data=await response.json();if(!Array.isArray(data.roomTypes))throw Error('Room collection is unavailable.');return data;
  });
  const ready=catalog.then(data=>{
    if(dateOK(data.today)){
      today=data.today;
      if(stay&&!valid(stay))stay=null;
      for(const form of forms){
        if(!form.dataset.edited){
          const arrival=form.elements.namedItem('checkIn'),departure=form.elements.namedItem('checkOut');
          if(arrival&&arrival.value<today){arrival.value=today;departure.value=addDays(today,1);}
        }
        limits(form);
      }
    }
    return data;
  }).catch(()=>null);
  window.HotelGuest=Object.freeze({catalog,ready,url,formatDate,addDays,readForm,remember,valid,stay:()=>stay,today:()=>today,
    price:minor=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:minor%100===0?0:2}).format(minor/100)});
  decorateLinks();

  const menu=document.getElementById('siteMenu'),menuButton=document.querySelector('[data-menu]'),header=document.querySelector('.masthead');
  function closeMenu(restore=false){if(!menu||!menuButton)return;menu.hidden=true;menu.classList.remove('show');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');if(restore)menuButton.focus();}
  menuButton?.addEventListener('click',()=>{
    const open=menuButton.getAttribute('aria-expanded')!=='true';
    menu.hidden=!open;menu.classList.toggle('show',open);menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton?.getAttribute('aria-expanded')==='true')closeMenu(true);});
  document.addEventListener('click',event=>{if(header&&!header.contains(event.target))closeMenu();});
  menu?.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
  window.matchMedia('(min-width: 1001px)').addEventListener('change',event=>{if(event.matches)closeMenu();});
  const onScroll=()=>header?.classList.toggle('is-scrolled',window.scrollY>80);
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  document.querySelectorAll('[data-request-topic]').forEach(link=>link.addEventListener('click',()=>{
    const form=document.querySelector('[data-enquiry-form]'),select=form?.elements.namedItem('topic');
    if(select&&Array.from(select.options).some(option=>option.value===link.dataset.requestTopic))select.value=link.dataset.requestTopic;
  }));
})();
