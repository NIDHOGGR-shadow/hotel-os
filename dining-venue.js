'use strict';
(function(){
  const options=window.HotelDiningCatalog||{};
  const slug=new URLSearchParams(window.location.search).get('venue')||'';
  const venue=Object.prototype.hasOwnProperty.call(options,slug)?options[slug]:null;
  const $=id=>document.getElementById(id);
  const newEl=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  if(!venue){
    $('venueName').textContent='Dining experience not found.';
    $('venueSubtitle').textContent='This dining experience is not listed. Browse the dining collection instead.';
    $('venueDescription').textContent='Explore the dining collection or send a table request to our team.';
    $('venueNote').textContent='The restaurant link may be outdated.';
    return;
  }
  document.title=venue.name+' | Hotel Dining';
  $('venueBreadcrumb').textContent=venue.name;
  $('venueKicker').textContent=venue.kicker;
  $('venueName').textContent=venue.name;
  $('venueSubtitle').textContent=venue.subtitle;
  $('venueIntroTitle').textContent=venue.subtitle;
  $('venueDescription').textContent=venue.description;
  $('venueNote').textContent=venue.note;
  const reservationUrl='/dining.html?venue='+encodeURIComponent(slug)+'#dining-request';
  const reserve=$('venueReserve');if(reserve)reserve.href=reservationUrl;
  document.querySelectorAll('a[href="/dining.html#dining-request"]').forEach(link=>link.href=reservationUrl);
  $('venueHero').style.setProperty('--photo','url("'+venue.hero+'")');

  const gallery=$('venueGallery');
  for(const photo of venue.gallery){
    const figure=newEl('figure','venue-figure');
    const img=newEl('img');
    img.src=photo.src;
    img.alt=photo.alt;
    img.loading='lazy';
    img.decoding='async';
    img.addEventListener('error',()=>{
      if(img.dataset.fallback)return;
      img.dataset.fallback='true';
      img.src='https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=75&auto=format&fit=crop';
    });
    const caption=newEl('figcaption','','Illustrative photography · ');
    const link=newEl('a','','Source');
    link.href=photo.source;
    link.target='_blank';
    link.rel='noopener noreferrer';
    caption.append(link);
    figure.append(img,caption);
    gallery.append(figure);
  }
  const menu=$('venueMenu');
  for(const section of venue.menus){
    const group=newEl('section','menu-group');
    const heading=newEl('div','menu-group-heading');
    heading.append(newEl('h3','',section.title),newEl('p','muted',section.description));
    group.append(heading);
    const items=newEl('div','menu-items');
    for(const dish of section.items){
      const item=newEl('article','menu-item');
      item.append(newEl('h4','',dish.name),newEl('p','',dish.description));
      items.append(item);
    }
    group.append(items);
    menu.append(group);
  }
})();
