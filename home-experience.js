'use strict';
(()=>{
  const root=document.getElementById('homeRooms'),guest=window.HotelGuest;
  if(!root||!guest)return;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  function render(data){
    root.replaceChildren();
    const starting=document.getElementById('homeStartingRate'),count=document.getElementById('homeRoomCount');
    if(starting)starting.textContent=data.roomTypes.length?guest.price(Math.min(...data.roomTypes.map(room=>room.nightlyRateMinor))):'Check dates';
    if(count)count.textContent=data.roomTypes.reduce((sum,room)=>sum+room.roomCount,0)+' rooms · '+data.roomTypes.length+' categories';
    if(!data.roomTypes.length){root.append(node('p','Rooms are currently unavailable.'));return;}
    data.roomTypes.forEach(room=>{
      const article=node('article',undefined,'featured-room'),photo=node('a',undefined,'featured-room-photo');photo.href=guest.url('/room.html',{id:room.id});
      const image=node('img');image.src=guest.roomPhoto(room.name,1000);image.loading='lazy';image.alt=room.name;photo.append(image);
      const content=node('div',undefined,'featured-room-text'),heading=node('h3'),name=node('a',room.name);name.href=photo.href;heading.append(name);
      const sub=node('p',room.roomCount+' room'+(room.roomCount===1?'':'s')+' · Up to '+room.capacity+' guests','muted');
      const rate=node('p',guest.price(room.nightlyRateMinor)+' / night','room-card-price');
      const actions=node('div',undefined,'card-action-row'),detail=node('a','Explore room →','text-link'),book=node('a','Check dates →','text-link');detail.href=photo.href;book.href=guest.url('/book.html',{roomTypeId:room.id});
      actions.append(detail,book);content.append(node('span','ROOMS & SUITES','eyebrow'),heading,sub,rate,actions);article.append(photo,content);root.append(article);
    });
  }
  guest.catalog.then(render).catch(()=>{root.replaceChildren(node('p','Rooms could not be loaded. Please try again.'));});
  window.addEventListener('hotel:catalog-updated',event=>render(event.detail));
})();
