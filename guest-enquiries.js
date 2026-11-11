'use strict';
// Receipts are shown only after the server confirms the request was persisted.
(()=>{
  const forms=Array.from(document.querySelectorAll('[data-enquiry-form]'));
  if(!forms.length)return;
  const status=(form,text,kind='')=>{
    const area=form.querySelector('[data-form-status]');
    area.hidden=false;area.className='note status enquiry-status '+kind;
    area.textContent=text;
    return area;
  };
  for(const form of forms){
    const search=new URLSearchParams(location.search),topic=form.elements.namedItem('topic'),venue=form.elements.namedItem('venuePreference');
    if(topic&&Array.from(topic.options).some(option=>option.value===search.get('topic')))topic.value=search.get('topic');
    if(venue&&Array.from(venue.options).some(option=>option.value===search.get('venue')))venue.value=search.get('venue');
    const receipt=search.get('reference'),detail=form.elements.namedItem('detail');
    if(form.dataset.enquiryKind==='general'&&detail&&!detail.value&&receipt&&/^[A-Za-z0-9.=-]{1,120}$/.test(receipt))detail.value='I have a question about reservation / payment reference '+receipt+'.\n';
    const submit=form.querySelector('button[type="submit"]');
    const originalLabel=submit.textContent;
    let signature=null,requestKey=null,saved=false;
    const another=document.createElement('button');
    another.type='button';another.className='button outline';
    another.textContent='Send another request';another.hidden=true;
    form.append(another);
    another.addEventListener('click',()=>{
      form.reset();saved=false;requestKey=null;signature=null;
      for(const control of form.querySelectorAll('input,select,textarea,button'))control.disabled=false;
      submit.textContent=originalLabel;another.hidden=true;
      const area=form.querySelector('[data-form-status]');area.textContent='';area.hidden=true;
      form.querySelector('input[name="guestName"]')?.focus();
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(saved||!form.reportValidity())return;
      const values=new FormData(form);
      const value=key=>String(values.get(key)||'').trim();
      const count=value('partySize');
      const preference=form.elements.namedItem('venuePreference');
      const venueName=preference?.value?preference.options[preference.selectedIndex].textContent:'';
      const payload={
        kind:form.dataset.enquiryKind||'general',topic:value('topic'),
        guestName:value('guestName'),email:value('email'),phone:value('phone'),
        preferredDate:value('preferredDate')||null,preferredTime:value('preferredTime')||null,
        partySize:count?Number(count):null,detail:(venueName?'Dining preference: '+venueName+'.\n':'')+value('detail'),website:value('website')
      };
      const current=JSON.stringify(payload);
      if(signature!==current){signature=current;requestKey=crypto.randomUUID();}
      const controls=Array.from(form.querySelectorAll('input,select,textarea,button'));
      const prior=controls.map(control=>control.disabled);
      for(const control of controls)control.disabled=true;
      form.setAttribute('aria-busy','true');submit.textContent='Sending request…';
      status(form,'Sending your request to the property team…');
      try{
        const response=await fetch('/api/guest-enquiries',{
          method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify({...payload,requestKey}),signal:AbortSignal.timeout(20000)
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw Error(data.error||'We could not confirm receipt. Please retry.');
        if(data.recorded!==true||!/^HREQ-[A-F0-9]{16}$/.test(data.reference||''))
          throw Error('We could not confirm receipt. Please retry.');
        saved=true;
        const area=status(form,'Request received. Your reference is ','success');
        const reference=document.createElement('strong');reference.textContent=data.reference;
        area.append(reference,document.createTextNode('Our team will follow up using your contact details. Keep this reference for any questions.'));
        const copy=document.createElement('button');copy.type='button';copy.className='button outline copy-reference';copy.textContent='Copy reference';
        copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(data.reference);copy.textContent='Reference copied';}catch{copy.textContent='Select and copy the reference above';}});area.append(copy);
        area.tabIndex=-1;area.focus();
        submit.textContent='Request received';another.hidden=false;another.disabled=false;
      }catch(error){
        const area=status(form,error.name==='AbortError'||error.name==='TimeoutError'
          ?'We could not confirm receipt. Your details are still here; retry when your connection is available.'
          :error.message||'Your request could not be sent. Please retry.','error');
        area.tabIndex=-1;area.focus();
      }finally{
        form.setAttribute('aria-busy','false');
        if(!saved){controls.forEach((control,index)=>{control.disabled=prior[index];});submit.textContent=originalLabel;}
      }
    });
  }
  fetch('/api/guest-enquiries',{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)})
    .then(async response=>{
      if(!response.ok)return;
      const data=await response.json();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(data.today||''))return;
      for(const input of document.querySelectorAll('[data-hotel-date]'))input.min=data.today;
    }).catch(()=>{/* Submission retains server-side date validation. */});
})();
