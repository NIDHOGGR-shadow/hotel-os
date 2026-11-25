/* Hotel OS visitor measurement: off by default; no non-essential tracking without consent. */
(() => {
  'use strict';
  const KEY='hotel_os_marketing_consent_v1';
  const CAMPAIGN='hotel_os_campaign_v1';
  let config=null;
  let choice=null;
  function savedChoice(){
    try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value?.v===1?value:null;}catch{return null;}
  }
  function saveChoice(value){
    const revokeLoadedTags=(gaStarted&&!value.analytics)||(metaStarted&&!value.ads);
    choice={v:1,analytics:!!value.analytics,ads:!!value.ads,at:new Date().toISOString()};
    try{localStorage.setItem(KEY,JSON.stringify(choice));}catch{}
    if(!choice.ads){try{sessionStorage.removeItem(CAMPAIGN);}catch{}}
    else getAttribution();
    activate();
    const bar=document.getElementById('hotelPrivacyBanner');
    if(bar)bar.remove();
    if(revokeLoadedTags)location.reload();
  }
  function loadScript(src){
    const tag=document.createElement('script');tag.async=true;tag.src=src;document.head.appendChild(tag);
  }
  let gaStarted=false,metaStarted=false;
  function activate(){
    if(choice?.analytics && config?.ga4Id && !gaStarted){
      gaStarted=true;
      window.dataLayer=window.dataLayer||[];
      window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
      window.gtag('js',new Date());
      window.gtag('config',config.ga4Id,{send_page_view:true});
      loadScript('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.ga4Id));
    }
    if(choice?.ads && config?.pixelId && !metaStarted){
      metaStarted=true;
      const f=window,b=document,e='script',v='https://connect.facebook.net/en_US/fbevents.js';
      if(!f.fbq){
        const n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};
        if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
        const t=b.createElement(e),s=b.getElementsByTagName(e)[0];
        t.async=true;t.src=v;s.parentNode.insertBefore(t,s);
      }
      f.fbq('init',config.pixelId);
      f.fbq('track','PageView');
    }
  }
  function getAttribution(){
    if(!choice?.ads||!config?.attributionEnabled)return null;
    const mapping={utm_source:'source',utm_medium:'medium',utm_campaign:'campaign',utm_id:'campaign_id',utm_content:'content',utm_term:'term'};
    const params=new URLSearchParams(location.search);
    const fresh={};
    for(const [key,name] of Object.entries(mapping)){
      const raw=params.get(key);
      if(!raw||raw.includes('@'))continue;
      const clean=raw.trim().replace(/[^A-Za-z0-9 _.-]/g,'').slice(0,name==='campaign_id'?80:160);
      if(clean)fresh[name]=clean;
    }
    try {
      if(Object.keys(fresh).length)sessionStorage.setItem(CAMPAIGN,JSON.stringify(fresh));
      const chosen=Object.keys(fresh).length?fresh:JSON.parse(sessionStorage.getItem(CAMPAIGN)||'null');
      return chosen&&typeof chosen==='object'&&Object.keys(chosen).length?{consent:true,...chosen}:null;
    }catch{return Object.keys(fresh).length?{consent:true,...fresh}:null;}
  }
  function track(name,props={}){
    const safe={event_category:'hotel_marketing',...props};
    if(choice?.analytics&&gaStarted&&typeof window.gtag==='function')window.gtag('event',name,safe);
    if(choice?.ads&&metaStarted&&typeof window.fbq==='function')
      window.fbq('trackCustom',name,safe);
  }
  function button(label,action){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.style.cssText='font:600 13px system-ui;cursor:pointer;padding:10px 13px;border:1px solid #cbc5bb;border-radius:6px;background:#fff;color:#222';
    b.addEventListener('click',action);return b;
  }
  function banner(){
    if(document.getElementById('hotelPrivacyBanner'))return;
    const bar=document.createElement('section');bar.id='hotelPrivacyBanner';
    bar.setAttribute('role','region');bar.setAttribute('aria-label','Privacy choices');
    bar.style.cssText='position:fixed;z-index:9999;bottom:15px;left:15px;right:15px;max-width:640px;margin:auto;padding:17px 20px;color:#24211e;background:#fbf8f3;box-shadow:0 6px 32px #0004;border:1px solid #ded4c8;border-radius:10px;font:14px/1.5 system-ui';
    const p=document.createElement('p');
    p.style.margin='0 0 12px';
    p.textContent='We use optional analytics to understand website visits and optional advertising tools to measure campaigns. You can reject either. Nothing non-essential is loaded until you agree.';
    const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
    actions.append(
      button('Reject optional tracking',()=>saveChoice({analytics:false,ads:false})),
      button('Analytics only',()=>saveChoice({analytics:true,ads:false})),
      button('Accept analytics & ads',()=>saveChoice({analytics:true,ads:true}))
    );
    bar.append(p,actions);document.body.appendChild(bar);
  }
  function privacyLink(){
    if(document.getElementById('hotelPrivacyChoices'))return;
    const b=button('Privacy choices',()=>banner());b.id='hotelPrivacyChoices';
    b.style.cssText+=';position:fixed;bottom:8px;right:8px;z-index:9998;opacity:.9;font-size:11px';
    document.body.appendChild(b);
  }
  async function start(){
    try{
      const response=await fetch('/api/marketing-config',{cache:'no-store'});
      if(!response.ok)return;
      config=await response.json();
      if(!config.pixelId&&!config.ga4Id&&!config.attributionEnabled)return;
      choice=savedChoice();
      privacyLink();
      if(choice){getAttribution();activate();}else banner();
      document.addEventListener('click',event=>{
        const a=event.target.closest?.('a[href]');if(!a)return;
        try{if(new URL(a.href,location.href).pathname==='/book.html')track('booking_link_click');}
        catch{}
      });
      document.addEventListener('submit',event=>{
        if(event.target?.id==='availabilityForm'&&event.target.checkValidity?.())track('availability_search');
        if(event.target?.id==='payForm'&&event.target.checkValidity?.())track('checkout_attempt');
      });
    }catch{/* Marketing telemetry must never interrupt reservations. */}
  }
  window.HotelMarketing={
    getAttribution,
    trackVerifiedBooking(){
      // Call only from server-confirmed payment AND reservation state; never from redirects.
      track('booking_confirmed');
      if(choice?.ads&&metaStarted&&typeof window.fbq==='function')window.fbq('track','Schedule');
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* The guest shell is independent of marketing consent and loads on every public page. */
(() => {
  if (window.__hotelShellRequested || document.querySelector('script[src="/site-shell.js"]')) return;
  window.__hotelShellRequested = true;
  const script = document.createElement('script');
  script.src = '/site-shell.js';
  script.defer = true;
  document.head.append(script);
})();
