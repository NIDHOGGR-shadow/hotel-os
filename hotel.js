'use strict';document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{const menu=document.getElementById('siteMenu');if(!menu)return;const expanded=menu.classList.toggle('show');btn.setAttribute('aria-expanded',String(expanded));menu.hidden=!expanded}));const today=new Date(),dateFormat=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};document.querySelectorAll('input[type=date][data-min-today]').forEach(i=>{i.min=dateFormat(today);if(!i.value)i.value=dateFormat(new Date(today.getTime()+86400000))});document.querySelectorAll('input[type=date][data-min-tomorrow]').forEach(i=>{i.min=dateFormat(new Date(today.getTime()+86400000));if(!i.value)i.value=dateFormat(new Date(today.getTime()+3*86400000))});
// Optional visitor telemetry is consent-gated and disabled until identifiers are configured.
const marketingTag=document.createElement('script');marketingTag.src='/marketing.js';marketingTag.async=true;document.head.appendChild(marketingTag);

if(document.querySelector('[data-hotel-menu],#roomsGrid')){
const catalog=fetch('/api/public-catalog',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json()});
window.HotelGuest={catalog,price:minor=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(minor/100)};
}
