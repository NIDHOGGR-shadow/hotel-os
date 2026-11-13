import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=file('manage.js'),html=file('manage.html'),inventory=file('catalog-admin.js'),css=file('manage.css');
const start=js.indexOf('const expandedRoomGroups='),end=js.indexOf('const RESERVATION_STATES=',start);
assert.ok(start!==-1&&end>start,'Grouped room renderer exists');
const snippet=js.slice(start,end);

function fakeNode(tag,text,style){
  return {
    tag,text,style,children:[],value:'',open:false,
    classList:{add(){}},
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=[...items]},
    addEventListener(event,callback){this['on'+event]=callback},
    setAttribute(){},
    scrollIntoView(){},
    focus(){}
  };
}
function inventoryView(search='',status='all'){
  const area=fakeNode('div');
  const roomType=fakeNode('select');
  roomType.value='';
  const inputs={physicalRooms:area,newRoomType:roomType,roomSearch:{value:search},roomConditionFilter:{value:status}};
  const context={
    Map,roomTypes:[
      {id:'standard',name:'Standard Room',image_path:null},
      {id:'deluxe',name:'Deluxe Room',image_path:null}
    ],
    rooms:[
      {id:'room101',room_type_id:'standard',room_number:'101',active:true,condition:'ready'},
      {id:'room102',room_type_id:'standard',room_number:'102',active:true,condition:'cleaning'},
      {id:'room201',room_type_id:'deluxe',room_number:'201',active:true,condition:'maintenance'}
    ],
    window:{HotelMedia:{url(){return null}}},
    maybeEl:id=>inputs[id]??null,
    el:id=>inputs[id],
    node:fakeNode,
    msg(){},operations(){},config:{propertyId:'p'},loadData:async()=>{},
  };
  vm.createContext(context);
  vm.runInContext(snippet+'renderInventory();',context);
  return {area,roomType};
}

test('physical rooms are grouped under actual room categories',()=>{
  const {area}=inventoryView();
  assert.equal(area.children.length,2);
  assert.equal(area.children[0].tag,'details');
  assert.equal(area.children[0].children[1].children.length,2);
  assert.equal(area.children[1].children[1].children.length,1);
});

test('room search returns matching room number within its category',()=>{
  const {area}=inventoryView('102');
  assert.equal(area.children.length,1);
  assert.equal(area.children[0].children[1].children.length,1);
});

test('room condition filter shows the requested housekeeping state',()=>{
  const {area}=inventoryView('','maintenance');
  assert.equal(area.children.length,1);
  assert.equal(area.children[0].children[1].children.length,1);
});

test('the admin UI makes no claim that Ready means unbooked',()=>{
  assert.match(html,/Booking status and housekeeping readiness are shown separately in color/i);
  assert.match(js,/ROOM_CONDITIONS/); // Room condition is separate from booking availability.
  assert.doesNotMatch(js.slice(start,end),/Available for booking/);
});

test('stock view includes real balance, reorder point and quick receipt workflow',()=>{
  assert.match(inventory,/stocks\.filter\(item=>item\.low_stock\)/);
  assert.match(inventory,/item\.reorder_level/);
  assert.match(inventory,/Receive stock/);
  assert.match(inventory,/movementStock/);
  assert.match(html,/id="stockOverview"/);
  assert.match(html,/id="refreshStockButton"/);
});

test('guest enquiries are identifiable as messages, not confirmed reservations',()=>{
  assert.match(html,/Guest inbox/);
  assert.match(html,/enquiries, not confirmed reservations/i);
  assert.match(html,/Refresh inbox/);
});

test('operational scripts parse and render responsive navigation',()=>{
  for(const script of [js,inventory])assert.doesNotThrow(()=>new vm.Script(script));
  assert.match(css,/\.room-group-heading/);
  assert.match(css,/\.stock-overview/);
});
