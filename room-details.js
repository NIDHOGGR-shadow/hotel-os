'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const catalog=window.HotelRoomCatalog||{};
 const query=new URLSearchParams(window.location.search);
 const slug=query.get('type');
 const id=query.get('id');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let currentImages=[],currentAlt='',activeIndex=0,lastFocused=null;
 const create=(tag,text,className)=>{
   const e=document.createElement(tag);
   if(text!==undefined)e.textContent=text;
   if(className)e.className=className;
   return e;
 };
 const normal=s=>String(s||'').trim().toLowerCase();
 const conceptKey=name=>window.HotelGuest.roomStyle(name);
 const fmt=(minor)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(minor/100);
 function render(room,rate=null,roomId=null,capacity=null,roomCount=null){
   document.title=room.name+' | HOTEL';
   $('roomBreadcrumb').textContent=room.name;
   $('roomCategory').textContent='ROOMS & SUITES';
   $('roomName').textContent=room.name;
   $('roomDescription').textContent=room.description;
   $('roomHero').style.setProperty('--photo','url("'+room.photo+'")');
   $('roomSpecs').replaceChildren();
   if(Number.isInteger(capacity)&&capacity>0){
     $('roomSpecs').append(create('span','Up to '+capacity+' guests'));
   }
   if(Number.isInteger(roomCount)&&roomCount>0){
     $('roomSpecs').append(create('span',roomCount+' room'+(roomCount===1?'':'s')));
   }
   if(Number.isSafeInteger(rate)&&rate>0){
     $('roomRate').textContent=fmt(rate)+' / night';
   }else{
     $('roomRate').textContent='Check availability';
   }
   const form=$('roomStayForm');
   form.hidden=false;
   const existing=form.querySelector('input[name=roomTypeId]');
   if(existing)existing.remove();
   if(roomId&&UUID.test(roomId)){
     const hidden=create('input');hidden.type='hidden';hidden.name='roomTypeId';hidden.value=roomId;form.append(hidden);
   }
   const gallery=$('roomGallery');gallery.replaceChildren();
   const seen=new Set();
   currentImages=[room.photo,...(room.gallery||[])].filter(url=>{
     if(typeof url!=='string'||!url.startsWith('https://')||seen.has(url))return false;
     const photoId=new URL(url).pathname;
     if(seen.has(photoId))return false;
     seen.add(photoId);return true;
   });
   currentAlt=room.alt||'Accommodation interior';
   currentImages.forEach((url,index)=>{
     const button=create('button',undefined,'room-gallery-button');
     button.type='button';button.setAttribute('aria-label','View photograph '+(index+1)+' of '+currentImages.length);
     const photo=create('img');photo.src=url;photo.alt=currentAlt+' — image '+(index+1);photo.loading='lazy';
     button.append(photo);button.addEventListener('click',()=>openLightbox(index));gallery.append(button);
   });
 }
 function openLightbox(index){
   if(!currentImages.length)return;
   lastFocused=document.activeElement;
   activeIndex=(index+currentImages.length)%currentImages.length;
   const dialog=$('roomLightbox');dialog.hidden=false;document.body.style.overflow='hidden';showPhoto();$('lightboxClose').focus();
 }
 function showPhoto(){
   $('lightboxImage').src=currentImages[activeIndex];
   $('lightboxImage').alt=currentAlt+' — photograph '+(activeIndex+1);
   $('lightboxCaption').textContent=(activeIndex+1)+' / '+currentImages.length;
 }
 function closeLightbox(){
   if($('roomLightbox').hidden)return;
   $('roomLightbox').hidden=true;document.body.style.overflow='';
   if(lastFocused&&typeof lastFocused.focus==='function')lastFocused.focus();
 }
 $('lightboxClose').addEventListener('click',closeLightbox);
 $('openRoomGallery').addEventListener('click',()=>openLightbox(0));
 $('lightboxPrev').addEventListener('click',()=>{activeIndex=(activeIndex-1+currentImages.length)%currentImages.length;showPhoto()});
 $('lightboxNext').addEventListener('click',()=>{activeIndex=(activeIndex+1)%currentImages.length;showPhoto()});
 $('roomLightbox').addEventListener('click',e=>{if(e.target===$('roomLightbox'))closeLightbox()});
 document.addEventListener('keydown',e=>{
   if($('roomLightbox').hidden)return;
   if(e.key==='Escape')closeLightbox();
   if(e.key==='ArrowLeft')$('lightboxPrev').click();
   if(e.key==='ArrowRight')$('lightboxNext').click();
   if(e.key==='Tab'){
     const items=[$('lightboxClose'),$('lightboxPrev'),$('lightboxNext')];
     const index=items.indexOf(document.activeElement);
     if(e.shiftKey&&index===0){e.preventDefault();items[items.length-1].focus();}
     else if(!e.shiftKey&&index===items.length-1){e.preventDefault();items[0].focus();}
   }
 });
 $('roomStayForm').addEventListener('submit',e=>{
   const start=$('roomCheckIn').value,end=$('roomCheckOut').value;
   if(!start||!end||end<=start){
     e.preventDefault();
     $('roomCheckOut').setCustomValidity('Please choose a checkout date after check-in.');
     $('roomCheckOut').reportValidity();
   }
 });
 $('roomCheckOut').addEventListener('input',()=>$('roomCheckOut').setCustomValidity(''));
 function unavailable(){
   $('roomName').textContent='This room is unavailable.';
   $('roomDescription').textContent='Please browse Rooms & Suites to see more accommodation options.';
   $('roomStayForm').hidden=true;$('roomRate').textContent='Explore other rooms';
 }
 const preview=slug&&Object.prototype.hasOwnProperty.call(catalog,slug)?catalog[slug]:null;
 if(preview&&!id)render(preview);
 if(id&&!UUID.test(id)){unavailable();return;}
 if(!preview&&!id){unavailable();return;}
 function update(json){
   try{
     const rows=Array.isArray(json.roomTypes)?json.roomTypes:[];
     const row=id?rows.find(r=>r.id===id):
       rows.find(r=>normal(r.name)===normal(preview.name))||
       rows.find(r=>conceptKey(r.name)===slug);
     if(!row){if(id)unavailable();return;}
     const concept=catalog[conceptKey(row.name)]||null;
     const desc=concept||{
       name:row.name,category:'ROOMS & SUITES',headline:'Your own place to unwind.',
       description:'A private space for moments of rest. Choose dates to explore availability and reserve your stay.',
       photo:'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1800&q=82&auto=format&fit=crop',
       gallery:['https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1100&q=80&auto=format&fit=crop'],
       alt:'Guest room interior',
       possibilities:['A place to rest','Room to unwind','An easy booking experience']
     };
     render({...desc,name:row.name,photo:window.HotelGuest.roomPhoto(row.name,1800)},row.nightlyRateMinor,row.id,row.capacity,row.roomCount);
   }catch{$('roomRate').textContent='Check availability';}
 }
 window.HotelGuest.catalog.then(update).catch(()=>{$('roomRate').textContent='Check availability';});
 window.addEventListener('hotel:catalog-updated',event=>update(event.detail));
})();
