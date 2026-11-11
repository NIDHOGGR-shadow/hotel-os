'use strict';
// Replace static homepage example cards with actual property room types whenever connected.
(async function(){
  const root=document.getElementById('roomGrid');
  if(!root)return;
  try{
    const response=await fetch('/api/public-catalog',{cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    if(!Array.isArray(data.roomTypes)||!data.roomTypes.length)return;
    const photos=[
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=900&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=900&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80&auto=format&fit=crop'
    ];
    const fmt=amount=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(amount/100);
    root.replaceChildren();
    for(const [index,room] of data.roomTypes.entries()){
      const card=document.createElement('article');card.className='room-card';
      const cover=document.createElement('div');cover.className='room-img';
      const img=document.createElement('img');img.src=photos[index%photos.length];img.loading='lazy';img.alt='Illustrative accommodation image';cover.append(img);
      const body=document.createElement('div');body.className='room-body';
      const marker=document.createElement('div');marker.className='eyebrow';marker.textContent='ACCOMMODATION';
      const heading=document.createElement('h3');heading.textContent=room.name;
      const description=document.createElement('p');description.className='meta';description.textContent='Up to '+room.capacity+' guests';
      const bottom=document.createElement('div');bottom.className='room-bottom';
      const price=document.createElement('span');price.className='price';price.textContent=fmt(room.nightlyRateMinor)+' / night';
      const link=document.createElement('a');link.className='linkbtn';link.href='/book.html?roomTypeId='+encodeURIComponent(room.id);link.textContent='Check availability ↗';
      bottom.append(price,link);body.append(marker,heading,description,bottom);card.append(cover,body);root.append(card);
    }
  }catch{
    // Keep the clearly labeled illustrative concept presentation while property setup is pending.
  }
})();
