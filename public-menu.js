'use strict';
(()=>{
  const roots=[...document.querySelectorAll('[data-hotel-menu]')],venue=document.getElementById('venueMenu');
  if(venue)roots.push(venue);
  const guest=window.HotelGuest;if(!roots.length||!guest)return;
  const make=(tag,text,css)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(css)el.className=css;return el;};
  function render(data){
    for(const root of roots){
      root.replaceChildren();
      if(!Array.isArray(data.menu)){root.append(make('p','The menu could not be loaded. Please try again.','muted'));continue;}
      if(!data.menu.length){root.append(make('p','Contact our team for the current menu.','muted'));continue;}
      const categories=[...new Set(data.menu.map(item=>item.category))];
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
            if(item.imageUrl){const picture=make('img',undefined,'priced-menu-photo');picture.src=item.imageUrl;picture.alt=item.name;picture.loading='lazy';picture.decoding='async';row.append(picture);}row.append(copy,make('strong',guest.price(item.priceMinor),'menu-price'));section.append(row);
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
