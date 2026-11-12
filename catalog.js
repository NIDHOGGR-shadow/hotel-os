'use strict';
(()=>{
  const root=document.getElementById('roomsGrid'),guest=window.HotelGuest,sort=document.getElementById('roomSort'),count=document.getElementById('collectionCount');
  if(!root||!guest)return;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  let rows=[];
  function render(){
    const list=[...rows].sort((a,b)=>sort?.value==='price-high'?b.nightlyRateMinor-a.nightlyRateMinor:sort?.value==='capacity'?b.capacity-a.capacity:a.nightlyRateMinor-b.nightlyRateMinor);
    root.replaceChildren();
    for(const room of list){
      const url=guest.url('/room.html',{id:room.id}),card=node('article',undefined,'card'),cover=node('a',undefined,'room-card-image');cover.href=url;
      const img=node('img');img.src=guest.roomPhoto(room.name);img.alt=room.name;img.loading='lazy';cover.append(img);
      const body=node('div',undefined,'body'),heading=node('h3'),name=node('a',room.name);name.href=url;heading.append(name);
      const facts=node('div',undefined,'room-card-facts');facts.append(node('span','Up to '+room.capacity+' guest'+(room.capacity===1?'':'s')),node('span',room.roomCount+' room'+(room.roomCount===1?'':'s')));
      const price=node('p',guest.price(room.nightlyRateMinor)+' / night','room-card-price');
      const actions=node('div',undefined,'room-card-actions'),detail=node('a','Explore room →','text-link');detail.href=url;
      const book=node('a','Check dates','button');book.href=guest.url('/book.html',{roomTypeId:room.id});
      actions.append(detail,book);body.append(node('span','ROOMS & SUITES','eyebrow'),heading,facts,price,actions);card.append(cover,body);root.append(card);
    }
    const total=rows.reduce((sum,room)=>sum+room.roomCount,0);
    count.textContent=total+' room'+(total===1?'':'s')+' · '+rows.length+' room '+(rows.length===1?'type':'types');
  }
  sort?.addEventListener('change',render);
  function update(data){
      rows=data.roomTypes.filter(room=>room&&typeof room.id==='string'&&typeof room.name==='string'&&Number.isInteger(room.capacity)&&Number.isSafeInteger(room.nightlyRateMinor)&&room.nightlyRateMinor>0);
      if(!rows.length){
        root.replaceChildren();count.textContent='No rooms are currently published.';
        return;
      }
      render();
  }
  guest.catalog.then(update).catch(()=>{root.replaceChildren();count.textContent='Room rates could not be loaded. Check your dates or contact reservations.';});
  window.addEventListener('hotel:catalog-updated',event=>update(event.detail));
})();
