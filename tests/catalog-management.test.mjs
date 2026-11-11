import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {handlePublicCatalog} from '../server/public-catalog.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const property='11111111-1111-4111-8111-111111111111';
const type='22222222-2222-4222-8222-222222222222';
const cfg={SUPABASE_URL:'https://hoteltest.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-secret-key-xxxxxxxxxxxxxxx',HOTEL_PROPERTY_ID:property};
function response(){
  let status=200,body;const headers={};
  return {setHeader(k,v){headers[k]=v;return this},status(n){status=n;return this},json(v){body=v;return this},result(){return {status,body,headers}}};
}
test('Public catalog cannot use an unconfigured hotel database',async()=>{
  for(const env of [{...cfg,HOTEL_PROPERTY_ID:undefined},{...cfg,SUPABASE_SERVICE_ROLE_KEY:undefined}]){
    const out=response();
    await handlePublicCatalog({method:'GET'},out,env,()=>{throw Error('should not call upstream')});
    assert.equal(out.result().status,503);
  }
});
test('Only authoritative, active hotel room rates are exposed and no service key leaked',async()=>{
  const calls=[],out=response();
  await handlePublicCatalog({method:'GET'},out,cfg,async(url,options)=>{
    calls.push({url,options});
    return Response.json([{id:type,name:'Deluxe King',capacity:2,nightly_rate_minor:15000000},
      {id:type,name:'Invalid',capacity:0,nightly_rate_minor:15000000},
      {id:'not-a-uuid',name:'Fake',capacity:2,nightly_rate_minor:1}]);
  });
  const result=out.result();
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{propertyId:property,currency:'NGN',
    roomTypes:[{id:type,name:'Deluxe King',capacity:2,nightlyRateMinor:15000000}]});
  assert.match(calls[0].url,/property_id=eq\./);
  assert.match(calls[0].url,/active=eq\.true/);
  assert.doesNotMatch(JSON.stringify(result.body),/test-secret-key/);
});
test('Public catalog is read only',async()=>{
  const out=response();await handlePublicCatalog({method:'POST'},out,cfg,()=>{throw Error('never')});
  assert.equal(out.result().status,405);
});
test('Manager and public catalogue scripts parse and link to shared booking process',()=>{
  const read=file=>readFileSync(resolve(root,file),'utf8');
  for(const name of ['manage.js','catalog.js','booking.js']){
    assert.doesNotThrow(()=>new Script(read(name)),name+' should parse');
  }
  const manage=read('manage.js'),catalog=read('catalog.js'),booking=read('booking.js');
  assert.match(manage,/set_room_rate/);
  assert.match(manage,/create_room_type/);
  assert.match(manage,/create_room/);
  assert.match(manage,/staff_memberships/);
  assert.match(manage,/\['owner','manager'\]/);
  assert.match(catalog,/\/api\/public-catalog/);
  assert.match(catalog,/\/book\.html\?roomTypeId=/);
  assert.match(booking,/preferredRoomType/);
  assert.match(read('rooms.html'),/src="\/catalog\.js"/);
  assert.match(read('manage.html'),/src="\/manage\.js"/);
  assert.doesNotMatch(catalog,/hotelOsPayments|localStorage/);
});
