'use strict';
// Real room names, capacity and nightly prices come from HOTEL's server-side catalog.
// Photographs are visual examples until a property publishes its own media.
(async function(){
 const root=document.getElementById('roomsGrid');
 if(!root)return;
 try{
   const response=await fetch('/api/public-catalog',{cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(!Array.isArray(data.roomTypes)||!data.roomTypes.length)return;
   const images=[
     'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1100&q=83&auto=format&fit=crop',
     'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1100&q=83&auto=format&fit=crop',
     'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1100&q=83&auto=format&fit=crop'
   ];
   const currency=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:data.currency==='NGN'?'NGN':'NGN',maximumFractionDigits:0}).format(n/100);
   root.replaceChildren();
   data.roomTypes.forEach((room,i)=>{
     const url='/room.html?id='+encodeURIComponent(room.id);
     const card=document.createElement('article');card.className='card';
     const cover=document.createElement('a');cover.href=url;cover.className='room-card-image';
     const img=document.createElement('img');img.src=images[i%images.length];img.loading='lazy';img.alt='Guest room photography for illustration';cover.append(img);
     const body=document.createElement('div');body.className='body';
     const label=document.createElement('span');label.className='eyebrow';label.textContent='ROOM COLLECTION';
     const heading=document.createElement('h3');heading.textContent=room.name;
     const description=document.createElement('p');description.textContent='Up to '+room.capacity+' guests';
     const price=document.createElement('p');price.className='room-card-price';price.textContent='From '+currency(room.nightlyRateMinor)+' per night';
     const actions=document.createElement('div');actions.className='room-card-actions';
     const detail=document.createElement('a');detail.href=url;detail.className='text-link';detail.textContent='Explore room ↗';
     const book=document.createElement('a');book.href='/book.html?roomTypeId='+encodeURIComponent(room.id);book.className='button';book.textContent='Check dates ↗';
     actions.append(detail,book);body.append(label,heading,description,price,actions);card.append(cover,body);root.append(card);
   });
 }catch{/* Keep curated room collection; do not invent pricing or availability. */}
})();
