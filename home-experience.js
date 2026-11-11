'use strict';
(()=>{
  const root=document.getElementById('homeRooms'),guest=window.HotelGuest;
  if(!root||!guest)return;
  const photos=[
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1000&q=82&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&q=82&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1000&q=82&auto=format&fit=crop'
  ];
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  guest.catalog.then(data=>{
    if(!data.roomTypes.length)return;
    root.replaceChildren();
    data.roomTypes.slice(0,3).forEach((room,index)=>{
      const article=node('article',undefined,'featured-room'),photo=node('a',undefined,'featured-room-photo');photo.href=guest.url('/room.html',{id:room.id});
      const image=node('img');image.src=photos[index%photos.length];image.loading='lazy';image.alt=room.name+' · room style photograph';photo.append(image);
      const content=node('div',undefined,'featured-room-text'),heading=node('h3'),name=node('a',room.name);name.href=photo.href;heading.append(name);
      const sub=node('p','Up to '+room.capacity+' guests · From '+guest.price(room.nightlyRateMinor)+' / night','muted');
      const actions=node('div',undefined,'card-action-row'),detail=node('a','Explore room →','text-link'),book=node('a','Check dates →','text-link');detail.href=photo.href;book.href=guest.url('/book.html',{roomTypeId:room.id});
      actions.append(detail,book);content.append(node('span','ROOMS & SUITES','eyebrow'),heading,sub,actions);article.append(photo,content);root.append(article);
    });
  }).catch(()=>{/* Guests can still browse the room styles and open reservations. */});
})();
