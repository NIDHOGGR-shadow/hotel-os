'use strict';
document.querySelectorAll('[data-menu]').forEach(button=>button.addEventListener('click',()=>{
  const menu=document.getElementById('siteMenu');
  if(!menu)return;
  const expanded=menu.classList.toggle('show');
  button.setAttribute('aria-expanded',String(expanded));menu.hidden=!expanded;
}));
const today=new Date();
const dateFormat=date=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
document.querySelectorAll('input[type=date][data-min-today]').forEach(input=>{
  input.min=dateFormat(today);
  if(!input.value)input.value=dateFormat(new Date(today.getTime()+86400000));
});
document.querySelectorAll('input[type=date][data-min-tomorrow]').forEach(input=>{
  input.min=dateFormat(new Date(today.getTime()+86400000));
  if(!input.value)input.value=dateFormat(new Date(today.getTime()+3*86400000));
});
