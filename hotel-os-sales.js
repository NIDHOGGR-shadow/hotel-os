/* Hotel OS owner-facing ad/lead tracking. Separate from individual hotel guest pixels. */
(()=>{'use strict';
const $=id=>document.getElementById(id), form=$('ownerLeadForm'),button=$('submitLead'),status=$('formStatus');
const CONSENT='hotel_os_b2b_marketing_consent_v1';
let config=null,turnstileToken='',widgetId=null,gaActive=false,metaActive=false;
function show(message,isError=false,isGood=false){status.textContent=message;status.className=isError?'error':isGood?'good':'';}
function choice(){
 try{const c=JSON.parse(localStorage.getItem(CONSENT)||'null');return c&&c.version===1?c:null;}
 catch{return null;}
}
function script(src,callback){
 const el=document.createElement('script');el.async=true;el.src=src;
 if(callback)el.onload=callback;document.head.appendChild(el);
}
function enableTracking(){
 const c=choice();
 if(c?.analytics&&config?.ga4Id&&!gaActive){
  gaActive=true;window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());window.gtag('config',config.ga4Id,{send_page_view:true});
  script('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.ga4Id));
 }
 if(c?.ads&&config?.pixelId&&!metaActive){
  metaActive=true;
  if(!window.fbq){
   const n=window.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};
   n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
   script('https://connect.facebook.net/en_US/fbevents.js');
  }
  window.fbq('init',config.pixelId);window.fbq('track','PageView');
 }
}
function track(name,leadId){
 const c=choice();
 if(c?.analytics&&gaActive&&typeof window.gtag==='function')
  window.gtag('event',name,{event_category:'hotel_os_b2b'});
 if(c?.ads&&metaActive&&typeof window.fbq==='function'){
  if(name==='generate_lead')window.fbq('track','Lead',{},leadId?{eventID:leadId}:undefined);
  else window.fbq('trackCustom',name);
 }
}
function consentUi(){
 if(!config?.ga4Id&&!config?.pixelId)return;
 const panel=document.createElement('aside');
 panel.id='b2bPrivacy';panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;margin:auto;max-width:590px;padding:16px 18px;border:1px solid #dbcfd1;border-radius:9px;background:#fff;z-index:50;box-shadow:0 10px 28px #0002;font:14px/1.5 system-ui';
 panel.setAttribute('aria-label','Advertising privacy choices');
 const p=document.createElement('p');p.textContent='Optional analytics and advertising measurement are off until you choose. These tools are separate from your enquiry form.';p.style.margin='0 0 10px';
 const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:9px';
 const options=[['Reject',false,false],['Analytics only',true,false],['Analytics and ads',true,true]];
 for(const [label,analytics,ads] of options){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.style.cssText='padding:9px 12px;background:#f5f1ef;border:1px solid #d1c9c9;border-radius:6px;cursor:pointer';
  b.addEventListener('click',()=>{
   const prev=choice();localStorage.setItem(CONSENT,JSON.stringify({version:1,analytics,ads}));
   panel.remove();
   // Unload already active optional tags by reloading if consent is withdrawn.
   if((prev?.analytics&&!analytics&&gaActive)||(prev?.ads&&!ads&&metaActive)){location.reload();return;}
   enableTracking();
  });
  actions.appendChild(b);
 }
 panel.append(p,actions);document.body.appendChild(panel);
}
function attribution(){
 const p=new URLSearchParams(location.search);
 const clean=(s,max)=>String(s||'').replace(/[^a-zA-Z0-9 _.-]/g,'').slice(0,max);
 return {source:clean(p.get('utm_source'),100),medium:clean(p.get('utm_medium'),100),
   name:clean(p.get('utm_campaign'),160),id:clean(p.get('utm_id'),30)};
}
async function submit(event){
 event.preventDefault();
 if(!config?.ready){show('Online enquiries are not enabled for this property yet.',true);return;}
 if(!form.reportValidity()){show('Please check the required details.',true);return;}
 if(!$('email').value.trim()&&!$('phone').value.trim()){show('Enter an email or phone number so we can reach you.',true);return;}
 if(!turnstileToken){show('Complete bot verification to submit.',true);return;}
 button.disabled=true;show('Sending your request…');
 const body={
   hotelName:$('hotelName').value,roomCount:$('roomCount').value,
   contactName:$('contactName').value,city:$('city').value,
   email:$('email').value,phone:$('phone').value,
   message:$('message').value,website:$('website').value,
   consentToContact:$('consentToContact').checked,
   consentToAttribution:$('consentToAttribution').checked,
   campaign:$('consentToAttribution').checked?attribution():null,
   turnstileToken
 };
 try{
  const response=await fetch('/api/hotel-os-leads',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok||!result.received)throw Error(result.error||'Enquiry could not be sent.');
  track('generate_lead',result.reference);
  form.reset();show('Request received. We can follow up using the details you provided.',false,true);
 }catch(e){show(e.message||'Unable to submit right now.',true);}
 finally{
  button.disabled=false;turnstileToken='';
  if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId);
 }
}
async function init(){
 form.addEventListener('submit',submit);
 document.querySelectorAll('[data-demo-click]').forEach(a=>a.addEventListener('click',()=>track('demo_cta_click')));
 try{
  const response=await fetch('/api/hotel-os-leads',{cache:'no-store'});
  if(!response.ok)throw Error('Failed to check enquiry service');
  config=await response.json();
  if(config.pixelId||config.ga4Id){
   if(choice())enableTracking();else consentUi();
   const b=document.createElement('button');b.type='button';b.textContent='Privacy choices';
   b.style.cssText='position:fixed;right:10px;bottom:9px;z-index:49;border:1px solid #aaa;background:#fff;padding:6px 9px;border-radius:5px;font:12px system-ui';
   b.addEventListener('click',()=>{const old=$('b2bPrivacy');if(old)old.remove();consentUi();});
   document.body.appendChild(b);
  }
  if(!config.ready||!config.siteKey){show('Demo requests are not connected yet. This form cannot send a request.',true);return;}
  script('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',()=>{
   if(!window.turnstile){show('Bot verification could not load.',true);return;}
   widgetId=window.turnstile.render('#turnstileWidget',{sitekey:config.siteKey,
     callback:token=>{turnstileToken=token;},
     'expired-callback':()=>{turnstileToken='';},
     'error-callback':()=>{turnstileToken='';show('Verification unavailable. Please refresh.',true);}
   });
   button.disabled=false;show('Ready to receive your enquiry.');
  });
 }catch{show('The enquiry service is currently unavailable. No request has been submitted.',true);}
}
init();
})();