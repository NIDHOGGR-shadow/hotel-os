'use strict';
(()=>{
  const root=document.getElementById('roomsGrid'),guest=window.HotelGuest,sort=document.getElementById('roomSort'),count=document.getElementById('collectionCount');
  if(!root||!guest)return;
  const images=[
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1100&q=83&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1100&q=83&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1100&q=83&auto=format&fit=crop'
  ];
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  let rows=[];
  const photos=new Map();
  function render(){
    const list=[...rows].sort((a,b)=>sort?.value==='price-high'?b.nightlyRateMinor-a.nightlyRateMinor:sort?.value==='capacity'?b.capacity-a.capacity:a.nightlyRateMinor-b.nightlyRateMinor);
    root.replaceChildren();
    for(const room of list){
      const url=guest.url('/room.html',{id:room.id}),card=node('article',undefined,'card'),cover=node('a',undefined,'room-card-image');cover.href=url;
      const img=node('img');img.src=photos.get(room.id);img.alt=room.name+' · room style photograph';img.loading='lazy';cover.append(img);
      const body=node('div',undefined,'body'),heading=node('h3'),name=node('a',room.name);name.href=url;heading.append(name);
      const facts=node('div',undefined,'room-card-facts');facts.append(node('span','Up to '+room.capacity+' guest'+(room.capacity===1?'':'s')),node('span','Full-payment reservation'));
      const price=node('p','From '+guest.price(room.nightlyRateMinor)+' / night','room-card-price');
      const actions=node('div',undefined,'room-card-actions'),detail=node('a','Explore room →','text-link');detail.href=url;
      const book=node('a','Check dates','button');book.href=guest.url('/book.html',{roomTypeId:room.id});
      actions.append(detail,book);body.append(node('span','ROOMS & SUITES','eyebrow'),heading,facts,price,actions);card.append(cover,body);root.append(card);
    }
    count.textContent=rows.length+' room '+(rows.length===1?'category':'categories')+' · Nightly rates in NGN';
  }
  sort?.addEventListener('change',render);
  (async()=>{
    try{
      const data=await guest.catalog;
      rows=data.roomTypes.filter(room=>room&&typeof room.id==='string'&&typeof room.name==='string'&&Number.isInteger(room.capacity)&&Number.isSafeInteger(room.nightlyRateMinor)&&room.nightlyRateMinor>0);
      if(!rows.length){
        count.textContent='Choose your dates or ask our reservations team for assistance.';
        return;
      }
      rows.forEach((room,index)=>photos.set(room.id,images[index%images.length]));render();
    }catch{
      count.textContent='Room rates could not be loaded. Check your dates or contact reservations.';
    }
  })();
})();
