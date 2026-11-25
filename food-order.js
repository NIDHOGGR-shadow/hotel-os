'use strict';
(()=>{const $=id=>document.getElementById(id),dialog=$('foodOrder');if(!dialog)return;let item=null,busy=false;
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(n/100);
const update=()=>{$('foodPay').textContent='Pay '+money((item?.priceMinor||0)*Number($('foodQty').value||1))+' with Paystack';$('foodLocationLabel').textContent=$('foodKind').value==='room'?'Room number':'Table number'};
window.HotelFood={open(value){if(busy)return;item=value;$('foodForm').reset();$('foodTitle').textContent=value.name;$('foodUnit').textContent=money(value.priceMinor)+' each';$('foodStatus').textContent='';update();dialog.showModal()}};
$('closeFood').onclick=()=>{if(!busy)dialog.close()};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});$('foodQty').oninput=update;$('foodKind').onchange=update;
$('foodForm').onsubmit=async e=>{e.preventDefault();if(busy||!item||!$('foodForm').reportValidity())return;busy=true;$('foodPay').disabled=true;$('foodStatus').textContent='Opening secure checkout…';
try{const quantity=Number($('foodQty').value);const r=await fetch('/api/food-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:item.id,quantity,quotedAmount:item.priceMinor*quantity,deliveryKind:$('foodKind').value,deliveryLabel:$('foodLocation').value.trim(),email:$('foodEmail').value.trim()})});const data=await r.json();if(!r.ok||!/^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9]+\/?$/.test(data.authorizationUrl||''))throw Error(data.error||'Could not open checkout');try{localStorage.setItem('hotel_food_last_reference',data.reference)}catch{}location.assign(data.authorizationUrl)}catch(err){$('foodStatus').textContent=err.message;busy=false;$('foodPay').disabled=false}};
})();
