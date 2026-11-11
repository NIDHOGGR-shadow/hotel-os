'use strict';
(function(){
 const catalog=window.HotelRoomCatalog||{};
 const slug=new URLSearchParams(window.location.search).get('type')||'';
 const room=Object.prototype.hasOwnProperty.call(catalog,slug)?catalog[slug]:null;
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 if(!room){
  $('roomName').textContent='Room not found.';
  $('roomHeadline').textContent='Explore the available room categories.';
  $('roomDescription').textContent='The requested room concept is not listed. Please return to Rooms & Suites.';
  $('roomIntro').textContent='Choose another room.';
  return;
 }
 document.title=room.name+' | Hotel';
 $('roomBreadcrumb').textContent=room.name;
 $('roomCategory').textContent=room.category;
 $('roomName').textContent=room.name;
 $('roomHeadline').textContent=room.headline;
 $('roomIntro').textContent=room.headline;
 $('roomDescription').textContent=room.description;
 $('roomHero').style.setProperty('--photo','url("'+room.photo+'")');
 const specs=$('roomSpecs');
 for(const fact of [room.size,room.bed,room.guests])specs.append(el('span','',fact));
 const gallery=$('roomGallery');
 for(const src of room.gallery){
  const img=el('img');
  img.src=src;
  img.alt=room.alt;
  img.loading='lazy';
  img.decoding='async';
  gallery.append(img);
 }
 const list=$('roomPossibilities');
 for(const feature of room.possibilities)list.append(el('li','',feature));
})();
