'use strict';
(function(){
 const form=document.getElementById('homeBooking');
 if(form)form.addEventListener('submit',e=>{
   const start=form.elements.namedItem('checkIn')?.value||'';
   const end=form.elements.namedItem('checkOut')?.value||'';
   if(!start||!end||end<=start){
     e.preventDefault();
     const departure=form.elements.namedItem('checkOut');
     departure?.setCustomValidity('Check-out must be later than check-in.');
     departure?.reportValidity();
     departure?.addEventListener('input',()=>departure.setCustomValidity(''),{once:true});
   }
 });
 const root=document.getElementById('homeRooms');
 if(!root)return;
 const photos=[
   'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1000&q=82&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&q=82&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1000&q=82&auto=format&fit=crop'
 ];
 (async()=>{
   try{
     const res=await fetch('/api/public-catalog',{cache:'no-store'});
     if(!res.ok)return;
     const data=await res.json();
     if(!Array.isArray(data.roomTypes)||!data.roomTypes.length)return;
     const price=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n/100);
     root.replaceChildren();
     data.roomTypes.slice(0,3).forEach((room,i)=>{
       const article=document.createElement('article');article.className='featured-room';
       const photo=document.createElement('a');photo.className='featured-room-photo';
       photo.href='/room.html?id='+encodeURIComponent(room.id);
       const img=document.createElement('img');img.src=photos[i%photos.length];img.loading='lazy';img.alt='Accommodation photograph for illustration';
       photo.append(img);
       const content=document.createElement('div');content.className='featured-room-text';
       const kicker=document.createElement('span');kicker.className='eyebrow';kicker.textContent='ROOM COLLECTION';
       const heading=document.createElement('h3');
       const name=document.createElement('a');name.href=photo.href;name.textContent=room.name;heading.append(name);
       const sub=document.createElement('p');sub.className='muted';sub.textContent='Up to '+room.capacity+' guests · From '+price(room.nightlyRateMinor)+' / night';
       const link=document.createElement('a');link.className='text-link';link.href=photo.href;link.textContent='Explore room ↗';
       content.append(kicker,heading,sub,link);article.append(photo,content);root.append(article);
     });
   }catch{/* Preserve visual room collection without inventing availability or rates. */}
 })();
 if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window){
   const elems=document.querySelectorAll('.hotel-introduction .intro-columns, .accommodation-section .editorial-head, .story-content, .gallery-teaser .editorial-head');
   const observer=new IntersectionObserver(entries=>{
     for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}
   },{threshold:.08});
   elems.forEach(el=>{el.classList.add('reveal');observer.observe(el)});
 }
})();
