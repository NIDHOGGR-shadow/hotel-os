'use strict';
// Shared gallery editor for hotel room categories and restaurant dishes.
// All writes go through authenticated, role-checked database RPCs and Storage RLS.
(()=>{
  const imageParts={
    'room-types':['Bedroom','Bathroom','Living area','Balcony','View','Amenities','Entrance','Other'],
    'menu-items':['Main dish','Close-up','Serving','Ingredients','Presentation','Other']
  };
  const make=(tag,text,cls)=>{
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(cls)el.className=cls;
    return el;
  };
  const controls=(label,callback,secondary=true)=>{
    const button=make('button',label,secondary?'button outline':'button');
    button.type='button';button.addEventListener('click',callback);return button;
  };
  function render(kind,item,photos,reload){
    const panel=make('section',undefined,'catalog-gallery-panel');
    if(!window.HotelMedia||!Array.isArray(photos))return panel;
    const ordered=[...photos].sort((a,b)=>a.position-b.position||a.created_at.localeCompare(b.created_at));
    const header=make('div',undefined,'catalog-gallery-heading');
    header.append(make('strong',kind==='room-types'?'Room photo gallery':'Dish photos'));
    header.append(make('span',ordered.length+' / 7 photos','catalog-gallery-counter'));
    panel.append(header);
    const status=make('p','','form-message');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');

    function attempt(button,action){
      button.disabled=true;
      status.textContent='Saving changes…';
      Promise.resolve().then(action).then(()=>reload()).catch(error=>{
        status.textContent=error?.message||'Could not change the photo.';
        button.disabled=false;
      });
    }
    const gallery=make('div',undefined,'catalog-gallery-grid');
    if(!ordered.length){
      gallery.append(make('p','No hotel photos uploaded yet. Add photos below; choose a cover image that guests will see first.','helper'));
    }
    for(const [index,photo] of ordered.entries()){
      const tile=make('article',undefined,'catalog-gallery-tile');
      const photoUrl=window.HotelMedia.url(photo.path);
      if(photoUrl){
        const image=make('img');image.src=photoUrl;image.alt=photo.caption||item.name+' photo '+(index+1);
        image.loading='lazy';image.decoding='async';tile.append(image);
      }
      const isCover=photo.path===item.image_path;
      tile.append(make('span',isCover?'Cover photo':'Photo '+(index+1),isCover?'gallery-photo-cover':'gallery-photo-number'));
      const label=make('label','View / description');
      const field=make('input');field.type='text';field.value=photo.caption||'';field.maxLength=120;
      field.placeholder=kind==='room-types'?'Bedroom, bathroom, balcony…':'Main dish, serving, ingredients…';
      label.append(field);tile.append(label);
      const actions=make('div',undefined,'gallery-photo-actions');
      const captionButton=controls('Save label',()=>attempt(captionButton,()=>window.HotelMedia.edit(kind,item.id,'caption',photo.id,field.value)));
      actions.append(captionButton);
      if(!isCover){
        const coverButton=controls('Make cover',()=>attempt(coverButton,()=>window.HotelMedia.edit(kind,item.id,'cover',photo.id)));
        actions.append(coverButton);
      }
      if(index>0){
        const up=controls('↑',()=>attempt(up,()=>window.HotelMedia.edit(kind,item.id,'move_up',photo.id)));
        up.setAttribute('aria-label','Move '+(photo.caption||'photo')+' earlier');
        actions.append(up);
      }
      if(index<ordered.length-1){
        const down=controls('↓',()=>attempt(down,()=>window.HotelMedia.edit(kind,item.id,'move_down',photo.id)));
        down.setAttribute('aria-label','Move '+(photo.caption||'photo')+' later');
        actions.append(down);
      }
      const remove=controls('Remove',()=>{
        if(!window.confirm('Remove this photo from '+item.name+'? This cannot be undone.'))return;
        attempt(remove,async()=>{
          const outcome=await window.HotelMedia.remove(kind,item.id,photo);
          if(outcome.warning){status.textContent=outcome.warning;await reload();throw Error(outcome.warning);}
        });
      });
      remove.classList.add('gallery-remove');
      actions.append(remove);tile.append(actions);gallery.append(tile);
    }
    panel.append(gallery);
    if(ordered.length<7){
      const editor=make('div',undefined,'gallery-photo-add');
      const label=make('label','Add images from your device (JPG, PNG, WebP · max 5 MB each)');
      const input=make('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/webp';
      label.append(input);
      const viewLabel=make('label','Photo section');
      const view=make('select');
      for(const name of imageParts[kind]||['Other']){const option=make('option',name);option.value=name;view.append(option);}
      viewLabel.append(view);
      const upload=controls('Upload selected photos',()=>{
        const files=[...input.files||[]];
        if(!files.length){status.textContent='Choose photos first.';return;}
        if(files.length+ordered.length>7){status.textContent='You can keep up to seven photos per category or dish.';return;}
        attempt(upload,async()=>{
          let count=0;
          for(const file of files){
            await window.HotelMedia.upload(file,kind,item.id,view.value);
            count++;
            status.textContent='Uploaded '+count+' of '+files.length+' photos…';
          }
        });
      },false);
      editor.append(label,viewLabel,upload);panel.append(editor);
    }else{
      panel.append(make('p','Gallery full. Remove an image to add another.','helper'));
    }
    panel.append(status);
    return panel;
  }
  window.HotelGalleries=Object.freeze({render});
})();
