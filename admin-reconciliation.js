(() => {
'use strict';
const $=id=>document.getElementById(id);
const KEY='hotel_os_finance_session_v1';
let session=null,report=null,view='all';
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:2}).format(n/100);
function msg(id,text){$(id).textContent=text}
function safeSession(){
 try{
  const raw=JSON.parse(sessionStorage.getItem(KEY)||'null');
  if(raw&&typeof raw.token==='string'&&raw.token.length>30&&Number.isFinite(raw.expiresAt)&&raw.expiresAt>Date.now()+15000)return raw;
 }catch{}
 return null;
}
function saveSession(accessToken,expiresIn){
 session={token:accessToken,expiresAt:Date.now()+Math.min(3600,Number(expiresIn)||3600)*1000};
 try{sessionStorage.setItem(KEY,JSON.stringify(session))}catch{}
}
function logout(){
 session=null;report=null;try{sessionStorage.removeItem(KEY)}catch{}
 $('staffReport').hidden=true;$('staffLogin').hidden=false;$('signOut').hidden=true;
 $('password').value='';msg('loginMessage','');
}
function statusName(value){
 return ({reconciled:'Matched & verified',amount_mismatch:'Amount mismatch',paid_needs_review:'Paid; booking needs review',
  missing_charge_record:'Payment ledger missing',sandbox_only:'Sandbox · no real income',payment_environment_unknown:'Payment mode unknown',awaiting_payment:'Awaiting payment',failed:'Failed',expired:'Expired'})[value]||'Needs review';
}
function isException(r){return ['amount_mismatch','paid_needs_review','missing_charge_record','payment_environment_unknown'].includes(r.reconciliation)}
function cell(value,klass){
 const td=document.createElement('td');td.textContent=String(value??'—');if(klass)td.className=klass;return td;
}
function render(){
 const rows=report?.records||[];
 const shown=view==='exceptions'?rows.filter(isException):rows;
 $('reportRows').replaceChildren();
 if(!shown.length){
  const tr=document.createElement('tr'),td=cell(view==='exceptions'?'No exceptions found.':'No recorded checkouts yet.');
  td.colSpan=6;tr.append(td);$('reportRows').append(tr);
 }
 for(const r of shown){
  const tr=document.createElement('tr');
  const ref=cell(r.reference,'reference');
  const amount=cell(money(r.amountMinor));
  const booking=cell(r.status);
  const payment=cell(r.paidAt?'Recorded':'Not recorded');
  const recon=cell(statusName(r.reconciliation));
  const pill=recon.textContent;recon.textContent='';
  const sp=document.createElement('span');sp.textContent=pill;
  sp.className='state '+(r.reconciliation==='reconciled'?'ok':isException(r)?'review':'');
  recon.append(sp);
  const date=cell(r.createdAt?new Date(r.createdAt).toLocaleDateString('en-NG'):'—');
  tr.append(ref,amount,booking,payment,recon,date);$('reportRows').append(tr);
 }
 $('reconciled').textContent=report.summary.reconciledCount;
 $('total').textContent=money(report.summary.reconciledMinor);
 $('attention').textContent=report.summary.attentionCount;
 $('allTab').setAttribute('aria-selected',String(view==='all'));
 $('exceptionsTab').setAttribute('aria-selected',String(view==='exceptions'));
 msg('reportMessage','Last refreshed: '+new Date(report.generatedAt).toLocaleString('en-NG')+' · '+shown.length+' of '+rows.length+' checkout records');
}
async function fetchReport(){
 if(!session || session.expiresAt<Date.now()+10000){logout();msg('loginMessage','Your session expired. Please sign in again.');return}
 msg('reportMessage','Reading verified payment records…');
 try{
  const res=await fetch('/api/admin-reconciliation',{headers:{Authorization:'Bearer '+session.token},cache:'no-store'});
  const body=await res.json();
  if(res.status===401||res.status===403){logout();msg('loginMessage','Finance session expired or access denied.');return}
  if(!res.ok||!Array.isArray(body.records)||!body.summary)throw Error(body.error||'Could not load records.');
  report=body;$('staffReport').hidden=false;$('staffLogin').hidden=true;$('signOut').hidden=false;render();
 }catch(error){msg('reportMessage',error.message||'Unable to load the finance report.')}
}
$('staffLogin').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!$('staffLogin').reportValidity())return;
 const button=$('loginButton');button.disabled=true;msg('loginMessage','Signing in securely…');
 try{
  const res=await fetch('/api/staff-login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});
  const body=await res.json();
  if(!res.ok)throw Error(body.error||'Sign-in unavailable.');
  if(typeof body.accessToken!=='string'||!Number.isFinite(body.expiresIn))throw Error('Invalid staff session.');
  saveSession(body.accessToken,body.expiresIn);
  $('password').value='';msg('loginMessage','');
  await fetchReport();
 }catch(error){msg('loginMessage',error.message||'Unable to sign in.')}
 finally{button.disabled=false}
});
$('signOut').addEventListener('click',logout);
$('refresh').addEventListener('click',fetchReport);
$('allTab').addEventListener('click',()=>{view='all';if(report)render()});
$('exceptionsTab').addEventListener('click',()=>{view='exceptions';if(report)render()});
$('printReport').addEventListener('click',()=>window.print());
function csvValue(v) {
 let s=String(v??'');
 if(/^[=+\-@]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
$('exportCsv').addEventListener('click',()=>{
 if(!report)return;
 const columns=['reference','amountMinor','currency','status','reconciliation','paymentEnvironment','reservationId','paidAt','createdAt'];
 const rows=[columns.join(','),...report.records.map(r=>columns.map(k=>csvValue(r[k])).join(','))];
 const csv='\uFEFF'+rows.join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='hotel-os-reconciliation-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
});
session=safeSession();
if(session)fetchReport();else logout();
})();