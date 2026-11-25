'use strict';
(()=>{
  const roots=[...document.querySelectorAll('[data-hotel-menu]')],venue=document.getElementById('venueMenu');
  if(venue)roots.push(venue);
  const guest=window.HotelGuest;if(!roots.length||!guest)return;
  const make=(tag,text,css)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(css)el.className=css;return el;};
  const photos={'Sweets & confections':'photo-1582058091505-f87a2e55a40f','French toast':'photo-1484723091739-30a097e8f929','Cheesecake':'photo-1533134242443-d4fd215305ad','Chocolate brownie':'photo-1606313564200-e75d5e30476c','Tomato pasta':'photo-1473093295043-cdd812d0e601','Beef steak':'photo-1546833999-b9f581a1996d','American breakfast':'photo-1533089860892-a7c6f0a88666','Grilled fish':'photo-1510130387422-82bed34b37e9'};
  function photoFor(item){if(item.name==='Roast chicken with jollof')return 'https://images.pexels.com/photos/37538487/pexels-photo-37538487.jpeg?auto=compress&cs=tinysrgb&w=640';return 'https://images.unsplash.com/'+(photos[item.name]||'photo-1546069901-ba9599a7e63c')+'?w=640&q=80&auto=format&fit=crop'}
  function render(data){
    for(const root of roots){
      root.replaceChildren();
      if(!Array.isArray(data.menu)){root.append(make('p','The menu could not be loaded. Please try again.','muted'));continue;}
      if(!data.menu.length){root.append(make('p','Contact our team for the current menu.','muted'));continue;}
      const categories=[...new Set(data.menu.map(item=>item.category))].sort((a,b)=>Number(b==='Confections')-Number(a==='Confections'));
      const filters=make('div',undefined,'menu-filters'),list=make('div',undefined,'priced-menu-grid');
      filters.setAttribute('role','group');filters.setAttribute('aria-label','Menu categories');
      let selected='All';
      function draw(){
        list.replaceChildren();
        for(const category of categories){
          if(selected!=='All'&&category!==selected)continue;
          const section=make('section',undefined,'priced-menu-section');section.append(make('h3',category));
          for(const item of data.menu.filter(item=>item.category===category)){
            const row=make('article',undefined,'priced-menu-item'),copy=make('div',undefined,'menu-item-copy');copy.append(make('h4',item.name));
            if(item.description)copy.append(make('p',item.description));
            const picture=make('img',undefined,'priced-menu-photo');picture.src=item.imageUrl||photoFor(item);picture.alt=item.imageUrl?item.name:'Serving inspiration for '+item.name;picture.loading='lazy';picture.decoding='async';const buy=make('button','Order • '+guest.price(item.priceMinor),'button menu-buy');buy.type='button';buy.addEventListener('click',()=>window.HotelFood.open(item));const cover=make('button',undefined,'menu-cover');cover.type='button';cover.setAttribute('aria-label','Order '+item.name);cover.append(picture);cover.addEventListener('click',()=>window.HotelFood.open(item));row.append(cover,copy,buy);section.append(row);
          }
          list.append(section);
        }
      }
      for(const category of ['All',...categories]){
        const button=make('button',category);button.type='button';button.setAttribute('aria-pressed',String(category===selected));
        button.addEventListener('click',()=>{selected=category;[...filters.children].forEach(child=>child.setAttribute('aria-pressed',String(child===button)));draw();});filters.append(button);
      }
      root.append(filters,list);draw();
    }
  }
  guest.catalog.then(render).catch(()=>{for(const root of roots)root.replaceChildren(make('p','The menu could not be loaded. Please try again.','muted'));});
  window.addEventListener('hotel:catalog-updated',event=>render(event.detail));
})();
