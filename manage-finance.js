(() => {
'use strict';
const $=id=>document.getElementById(id);
let report=null,view='all',serial=0,activeRole=null;
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:2}).format(n/100);
function msg(id,text){$(id).textContent=text}
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
async function fetchReport(){if(!['owner','manager','accountant'].includes(activeRole))return;const run=++serial;msg('reportMessage','Reading verified room payment records…');try{const token=await withToken();const res=await fetch('/api/admin-reconciliation',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const body=await res.json();if(run!==serial)return;if(!res.ok||!Array.isArray(body.records)||!body.summary)throw Error(body.error||'Could not load records.');report=body;render()}catch(e){if(run===serial){report=null;$('reportRows').replaceChildren();msg('reportMessage',e.message||'Unable to load finance records')}}}
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
function clear(){serial++;activeRole=null;report=null;view='all';$('financePanel').hidden=true;$('reportRows').replaceChildren();for(const id of ['reconciled','total','attention'])$(id).textContent='—';msg('reportMessage','');window.HotelReceiptTools?.clear()}
function open(role){clear();if(!['owner','manager','accountant','front_desk','restaurant'].includes(role))return;activeRole=role;const full=['owner','manager','accountant'].includes(role);$('financeReportTools').hidden=!full;$('receiptTools').hidden=false;$('foodOrderTools').hidden=!(full||role==='restaurant');$('financePanel').hidden=false;window.HotelReceiptTools?.open(role);if(full)void fetchReport()}
window.HotelFinance={open,clear};
})();