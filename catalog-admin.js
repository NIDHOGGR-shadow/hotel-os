'use strict';
(()=>{
  let menus=[],stocks=[],recipes=[],sequence=0,pendingMovement=null;
  const allowed=()=>session&&['owner','manager'].includes(currentRole);
  const amount=value=>new Intl.NumberFormat('en-NG',{maximumFractionDigits:3}).format(Number(value));
  function field(form,name){return form.elements.namedItem(name);}
  function input(label,value,name,type='text'){
    const wrap=node('label',label),control=node('input');control.name=name;control.type=type;control.value=String(value);wrap.append(control);return {wrap,control};
  }
  function checkbox(label,checked,name){const wrap=node('label',undefined,'check-label'),control=node('input');control.type='checkbox';control.name=name;control.checked=checked;wrap.append(control,document.createTextNode(label));return wrap;}
  function options(id,rows,key,label){
    const select=el(id),selected=select.value;select.replaceChildren();
    if(!rows.length){const option=node('option','No items yet');option.value='';select.append(option);return;}
    rows.forEach(row=>{const option=node('option',label(row));option.value=row[key];select.append(option);});
    if(rows.some(row=>row[key]===selected))select.value=selected;
  }
  function render(){
    const menuRoot=el('menuAdminList');menuRoot.replaceChildren();
    if(!menus.length)menuRoot.append(node('p','Add your first dish below.','helper'));
    for(const item of menus){
      const card=node('details',undefined,'menu-editor'),summary=node('summary');
      const imageUrl=window.HotelMedia?.url(item.image_path);
      if(imageUrl){const preview=node('img');preview.src=imageUrl;preview.alt='Photo of '+item.name;preview.loading='lazy';preview.className='menu-photo';summary.append(preview);}
      summary.append(node('span',item.name),node('strong',money(item.price_minor)),node('small',item.active?'Published':'Hidden'));card.append(summary);
      const form=node('form',undefined,'catalog-form');
      const name=input('Dish name',item.name,'name');name.control.required=true;name.control.minLength=2;name.control.maxLength=140;
      const price=input('Price (₦)',(item.price_minor/100).toFixed(2),'price','number');price.control.min='0.01';price.control.step='0.01';price.control.required=true;
      const category=input('Category',item.category,'category');category.control.maxLength=60;category.control.required=true;
      const desc=node('label','Description','form-wide'),textarea=node('textarea');textarea.name='description';textarea.maxLength=360;textarea.rows=2;textarea.value=item.description||'';desc.append(textarea);
      const button=node('button','Save dish','button');button.type='submit';
      const status=node('p','','form-message form-wide');status.setAttribute('role','status');
      const photo=node('label','Update dish photo','form-wide'),file=node('input');
      file.type='file';file.accept='image/jpeg,image/png,image/webp';file.name='image';photo.append(file);
      form.append(name.wrap,price.wrap,category.wrap,desc,photo,checkbox('Published on guest menu',item.active,'active'),checkbox('Deduct recipe ingredients when sold',item.tracks_ingredients,'tracked'),button,status);
      form.addEventListener('submit',async event=>{
        event.preventDefault();if(!allowed()||!form.reportValidity())return;
        button.disabled=true;status.textContent='Saving…';
        try{
          await saveDish(form,item.id);
          let photoWarning='';
          if(file.files?.[0]){
            try{await window.HotelMedia.upload(file.files[0],'menu-items',item.id);}
            catch(error){photoWarning=error.message||'Photo failed';}
          }
          await load();announceRateUpdate();
          msg('menuStatus',photoWarning?'Dish saved, but photo upload failed: '+photoWarning:'Dish and optional photo updated.',!photoWarning);
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
      });
      card.append(form);menuRoot.append(card);
    }
    const stockRoot=el('stockAdminList');stockRoot.replaceChildren();
    stocks.forEach(item=>{const card=node('article',undefined,'admin-record'),copy=node('div');copy.append(node('div',item.name,'name'),node('small',item.sku+' · '+item.unit));card.append(copy,node('strong',amount(item.on_hand)+' '+item.unit,item.low_stock?'status-warn':'status-good'));stockRoot.append(card);});
    if(!stocks.length)stockRoot.append(node('p','Add a stock item, then record its opening quantity as a receipt.','helper'));
    options('recipeMenu',menus.filter(item=>item.active),'id',item=>item.name);
    options('recipeStock',stocks,'stock_item_id',item=>item.name+' ('+item.unit+')');
    options('movementStock',stocks,'stock_item_id',item=>item.name+' · '+amount(item.on_hand)+' '+item.unit);
    const recipeRoot=el('recipeAdminList');recipeRoot.replaceChildren();
    const menuNames=new Map(menus.map(item=>[item.id,item.name])),stockNames=new Map(stocks.map(item=>[item.stock_item_id,item]));
    for(const recipe of recipes){const stock=stockNames.get(recipe.stock_item_id),row=node('p',menuNames.get(recipe.menu_item_id)+' · '+amount(recipe.quantity_per_serving)+' '+(stock?.unit||'')+' '+(stock?.name||'Stock item'),'helper');recipeRoot.append(row);}
  }
  async function load(){
    if(!allowed())return;
    const index=++sequence,user=identity?.id;
    msg('menuStatus','Loading menu…',true);msg('stockStatus','Loading stock…',true);
    try{
      const [menu,stock,recipe]=await Promise.all([operations('menu_items'),operations('stock_balances'),operations('recipe_ingredients')]);
      if(index!==sequence||!allowed()||identity?.id!==user)return;
      menus=(menu.data||[]).sort((a,b)=>a.name.localeCompare(b.name));stocks=(stock.data||[]).sort((a,b)=>a.name.localeCompare(b.name));recipes=recipe.data||[];render();
      msg('menuStatus',menus.filter(item=>item.active).length+' published dishes. Edit a dish to change its name, price or visibility.',true);
      msg('stockStatus',stocks.length+' stock items · '+stocks.filter(item=>item.low_stock).length+' at or below their low-stock level.',true);
    }catch(error){if(index===sequence&&allowed()){msg('menuStatus',error.message);msg('stockStatus',error.message);}}
  }
  async function saveDish(form,id){
    const price=validPrice(field(form,'price').value);if(!price)throw Error('Enter a positive price with up to two decimal places.');
    await operations('save_menu_item',{p_property:config.propertyId,p_item:id,p_name:field(form,'name').value.trim(),p_price_minor:price,p_category:field(form,'category').value.trim(),p_description:field(form,'description').value.trim(),p_tracks_ingredients:field(form,'tracked').checked,p_active:field(form,'active')?.checked??true});
  }
  el('newMenuForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!allowed()||!form.reportValidity())return;
    const button=form.querySelector('button[type=submit]');button.disabled=true;msg('menuStatus','Adding dish…',true);
    const id=form.dataset.itemId||crypto.randomUUID();form.dataset.itemId=id;
    try{
      await saveDish(form,id);
      const image=field(form,'image')?.files?.[0];
      let photoWarning='';
      if(image){
        try{await window.HotelMedia.upload(image,'menu-items',id);}
        catch(error){photoWarning=error.message||'Photo failed';}
      }
      form.reset();delete form.dataset.itemId;await load();announceRateUpdate();
      msg('menuStatus',photoWarning?'Dish saved, but its photo could not be uploaded: '+photoWarning:'Dish and optional photo published on the guest menu.',!photoWarning);
    }catch(error){msg('menuStatus',error.message);}finally{button.disabled=false;}
  });
  el('newStockForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!allowed()||!form.reportValidity())return;
    const button=form.querySelector('button[type=submit]');button.disabled=true;msg('stockStatus','Adding item…',true);
    try{await operations('create_stock_item',{p_property:config.propertyId,p_sku:field(form,'sku').value.trim(),p_name:field(form,'name').value.trim(),p_unit:field(form,'unit').value,p_reorder_level:Number(field(form,'reorder').value)});form.reset();await load();msg('stockStatus','Stock item saved. Record the opening quantity below.',true);}catch(error){msg('stockStatus',error.message);}finally{button.disabled=false;}
  });
  el('stockMovementForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!allowed()||!form.reportValidity())return;
    const reason=field(form,'reason').value,value=Number(field(form,'quantity').value),delta=reason==='waste'?-Math.abs(value):reason==='adjustment'?value:Math.abs(value);
    if(!Number.isFinite(delta)||delta===0){msg('stockMovementStatus','Enter a non-zero quantity.');return;}
    const details={p_property:config.propertyId,p_item:field(form,'item').value,p_delta:delta,p_reason:reason},fingerprint=JSON.stringify(details);
    if(pendingMovement?.fingerprint!==fingerprint)pendingMovement={fingerprint,key:crypto.randomUUID()};
    const button=form.querySelector('button[type=submit]');button.disabled=true;msg('stockMovementStatus','Recording…',true);
    try{await operations('stock_adjustment',{...details,p_request_key:pendingMovement.key});pendingMovement=null;field(form,'quantity').value='';await load();msg('stockMovementStatus','Movement saved. Daily opening and closing balances now include it.',true);}catch(error){msg('stockMovementStatus',error.message);}finally{button.disabled=false;}
  });
  el('recipeForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!allowed()||!form.reportValidity())return;
    const button=form.querySelector('button[type=submit]');button.disabled=true;msg('recipeStatus','Saving ingredient…',true);
    try{await operations('set_recipe_ingredient',{p_property:config.propertyId,p_menu_item:field(form,'menu').value,p_stock_item:field(form,'stock').value,p_quantity:Number(field(form,'quantity').value)});await load();msg('recipeStatus','Ingredient quantity saved per serving.',true);}catch(error){msg('recipeStatus',error.message);}finally{button.disabled=false;}
  });
  function clear(){sequence++;menus=[];stocks=[];recipes=[];pendingMovement=null;['menuAdminList','stockAdminList','recipeAdminList'].forEach(id=>el(id).replaceChildren());}
  window.HotelCatalogAdmin=Object.freeze({load,clear});
})();
