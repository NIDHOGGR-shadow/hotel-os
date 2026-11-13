'use strict';
// Product images are public; write permission is enforced by Supabase Storage RLS and the
// property-scoped hotel_set_catalog_image RPC, never by client-side role checks alone.
(()=>{
  const MIME_EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const pathPattern=/^[0-9a-f-]{36}\/(?:room-types|menu-items)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i;
  function url(path){
    if(!config?.supabaseUrl||!config?.propertyId||typeof path!=='string'||!pathPattern.test(path)||
       !path.startsWith(config.propertyId+'/'))return null;
    return config.supabaseUrl+'/storage/v1/object/public/hotel-media/'+path.split('/').map(encodeURIComponent).join('/');
  }
  async function checkImage(file){
    if(!(file instanceof File)||!MIME_EXT[file.type])throw Error('Select a JPG, PNG or WebP image.');
    if(file.size===0||file.size>5*1024*1024)throw Error('Image must be smaller than 5 MB.');
    // Check file magic bytes, not only the browser-supplied MIME type or extension.
    const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const isJpeg=b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
    const isPng=b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a;
    const isWebp=b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50;
    if(!((file.type==='image/jpeg'&&isJpeg)||(file.type==='image/png'&&isPng)||(file.type==='image/webp'&&isWebp))){
      throw Error('The selected file is not a valid image of that type.');
    }
    return MIME_EXT[file.type];
  }
  const editAllowed=()=>session&&['owner','manager'].includes(currentRole);
  const checkDestination=(kind,itemId)=>{
    if(!editAllowed())throw Error('Only an owner or manager can edit hotel photos.');
    if(!['room-types','menu-items'].includes(kind)||!uuid.test(itemId)||!uuid.test(config?.propertyId||''))throw Error('Invalid image destination.');
  };
  async function eraseStorage(path){
    if(!url(path))throw Error('Invalid stored photo path.');
    const token=await withToken();
    const response=await fetch(config.supabaseUrl+'/storage/v1/object/hotel-media/'+path,{
      method:'DELETE',headers:{apikey:config.anonKey,Authorization:'Bearer '+token}
    });
    return response.ok;
  }
  async function edit(kind,itemId,action,photoId,caption){
    checkDestination(kind,itemId);
    if(!['cover','remove','caption','move_up','move_down'].includes(action)||!uuid.test(photoId))throw Error('Invalid photo operation.');
    if(action==='caption'&&(typeof caption!=='string'||caption.length>120))throw Error('Photo caption must be 120 characters or fewer.');
    return operations('gallery_photo',{
      p_property:config.propertyId,p_kind:kind,p_entity:itemId,p_action:action,p_photo:photoId,
      ...(action==='caption'?{p_caption:caption.trim()}:{})
    });
  }
  async function remove(kind,itemId,photo){
    checkDestination(kind,itemId);
    if(!photo?.id||!uuid.test(photo.id)||!url(photo.path))throw Error('Invalid photo record.');
    await edit(kind,itemId,'remove',photo.id);
    // Metadata removal is authoritative. If this cleanup fails, report it; do not restore
    // the deleted reference or leave a broken public catalog.
    const removed=await eraseStorage(photo.path).catch(()=>false);
    return {warning:removed?'':'Removed from gallery, but the stored file could not be deleted. Ask an administrator to clean up unused media.'};
  }
  async function upload(file,kind,itemId,caption=''){
    if(!file)return null;
    checkDestination(kind,itemId);
    if(typeof caption!=='string'||caption.length>120)throw Error('The photo label is too long.');
    const ext=await checkImage(file),token=await withToken();
    const path=config.propertyId+'/'+kind+'/'+itemId+'/'+crypto.randomUUID()+'.'+ext;
    const response=await fetch(config.supabaseUrl+'/storage/v1/object/hotel-media/'+path,{
      method:'POST',headers:{
        apikey:config.anonKey,Authorization:'Bearer '+token,
        'Content-Type':file.type,'cache-control':'3600','x-upsert':'false'
      },body:file
    });
    if(!response.ok){
      if(response.status===403||response.status===401)throw Error('Photo upload was refused. Check your staff access and try again.');
      throw Error('Could not upload the photo. Please try again.');
    }
    try{
      await operations('gallery_photo',{
        p_property:config.propertyId,p_kind:kind,p_entity:itemId,p_action:'add',p_path:path,p_caption:caption.trim()
      });
    }catch(error){
      await eraseStorage(path).catch(()=>{});
      throw error;
    }
    return url(path);
  }
  window.HotelMedia=Object.freeze({upload,url,checkImage,edit,remove});
})();
