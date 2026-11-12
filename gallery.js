'use strict';
(()=>{
  const dialog=document.getElementById('galleryDialog');if(!dialog)return;
  const buttons=Array.from(document.querySelectorAll('[data-gallery-photo]'));
  let previous=null,index=0;
  const show=()=>{
    const image=buttons[index].querySelector('img'),caption=buttons[index].closest('figure').querySelector('figcaption');
    dialog.querySelector('img').src=image.src;dialog.querySelector('img').alt=image.alt;
    document.getElementById('galleryCaption').textContent=(index+1)+' / '+buttons.length+' · '+(caption?.textContent||'HOTEL');
  };
  buttons.forEach((button,position)=>{
    const caption=button.closest('figure').querySelector('figcaption');button.setAttribute('aria-label','View '+(caption?.textContent||'hotel photograph'));
    button.addEventListener('click',()=>{previous=button;index=position;show();dialog.showModal();document.body.style.overflow='hidden';});
  });
  const close=()=>dialog.close();dialog.querySelector('.lightbox-close').addEventListener('click',close);
  dialog.addEventListener('close',()=>{document.body.style.overflow='';previous?.focus();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'){event.preventDefault();index=(index+1)%buttons.length;show();}
    if(event.key==='ArrowLeft'){event.preventDefault();index=(index-1+buttons.length)%buttons.length;show();}
  });
  const controls=document.createElement('div');controls.className='gallery-viewer-controls';
  for(const [label,direction] of [['Previous',-1],['Next',1]]){
    const button=document.createElement('button');button.type='button';button.className='button light';button.textContent=label;
    button.addEventListener('click',()=>{index=(index+direction+buttons.length)%buttons.length;show();});controls.append(button);
  }
  dialog.append(controls);
})();
