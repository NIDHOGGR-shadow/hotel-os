'use strict';
// Public display reads the same approved prices that the checkout RPC uses.
(async function(){
  const grid=document.querySelector('main .grid');
  if(!grid)return;
  const section=grid.closest('.section');
  const label=document.createElement('p');label.className='helper';
  label.setAttribute('aria-live','polite');
  grid.parentNode.insertBefore(label,grid);
  try{
    const response=await fetch('/api/public-catalog',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Prices cannot be verified.');
    if(!Array.isArray(data.roomTypes)||data.roomTypes.length===0){
      grid.replaceChildren();label.textContent='No bookable room categories have been published yet. Please check back later.';return;
    }
    const images=[
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=900&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=900&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80&auto=format&fit=crop'
    ];
    const format=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n/100);
    grid.replaceChildren();
    for(const [i,r] of data.roomTypes.entries()){
      const card=document.createElement('article');card.className='card';
      const photo=document.createElement('img');photo.src=images[i%images.length];photo.loading='lazy';
      photo.alt='Illustrative accommodation photo, not an image of the actual room';
      const body=document.createElement('div');body.className='body';
      const type=document.createElement('span');type.className='eyebrow';type.textContent='Accommodation';
      const name=document.createElement('h3');name.textContent=r.name;
      const cap=document.createElement('p');cap.textContent='Up to '+r.capacity+' guests';
      const price=document.createElement('p');price.className='rooms-price';price.textContent='From '+format(r.nightlyRateMinor)+' / night';
      const link=document.createElement('a');link.className='text-link';link.href='/book.html?roomTypeId='+encodeURIComponent(r.id);link.textContent='Check rates & availability ↗';
      body.append(type,name,cap,price,link);card.append(photo,body);grid.append(card);
    }
    label.textContent='Rates shown are current approved nightly base rates. Final stay pricing and availability are confirmed during checkout. Photos are illustrative.';
  }catch{
    label.textContent='Illustrative room concepts are shown below. Actual inventory and rates are not connected; no reservation can be confirmed from these cards.';
  }
})();
