/** Server-only Hotel OS HTTP boundary. Never accepts a service-role key. */
export interface Incoming {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}
export interface Outgoing {
  status(code: number): Outgoing;
  setHeader(name: string, value: string): Outgoing;
  json(body: unknown): void;
}
export type Fetcher = typeof fetch;
type ParamType = 'uuid' | 'date' | 'text' | 'name' | 'money' | 'count' | 'quantity' | 'delta' | 'role' | 'status' | 'reason' | 'boolean' | 'email' | 'phone' | 'timezone' | 'feature' | 'condition' | 'seats' | 'enquiry_status' | 'note' | 'version';
type Field = [name: string, type: ParamType, optional?: boolean];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nameRe = /^.{2,140}$/u;
const keyRe = /^[a-z][a-z_]*$/;

export const resources = new Set([
  'properties','staff_memberships','property_features','room_types','rooms','guests',
  'reservations','folios','folio_entries','restaurant_tables','menu_items','stock_items',
  'stock_balances','recipe_ingredients','restaurant_orders','restaurant_order_lines',
  'stock_movements','suppliers','purchase_orders','purchase_order_lines',
  'housekeeping_tasks','guest_requests','guest_enquiries','payment_transactions','notification_jobs','audit_events'
]);
export const actions: Record<string,{fn:string;fields:Field[]}> = {
  create_property:{fn:'create_hotel_property',fields:[['p_name','name'],['p_timezone','timezone',true]]},
  set_feature:{fn:'set_hotel_feature',fields:[['p_property','uuid'],['p_feature','feature'],['p_enabled','boolean']]},
  add_staff:{fn:'add_hotel_staff',fields:[['p_property','uuid'],['p_user','uuid'],['p_role','role']]},
  create_room_type:{fn:'create_hotel_room_type',fields:[['p_property','uuid'],['p_name','name'],['p_rate_minor','money'],['p_capacity','count']]},
  create_room:{fn:'create_hotel_room',fields:[['p_property','uuid'],['p_room_type','uuid'],['p_room_number','text']]},
  create_guest:{fn:'create_hotel_guest',fields:[['p_property','uuid'],['p_name','name'],['p_email','email',true],['p_phone','phone',true]]},
  create_reservation:{fn:'create_room_reservation',fields:[['p_property','uuid'],['p_guest','uuid'],['p_room_type','uuid'],['p_check_in','date'],['p_check_out','date'],['p_request_key','uuid']]},
  change_reservation:{fn:'change_reservation_status',fields:[['p_property','uuid'],['p_reservation','uuid'],['p_status','status']]},
  update_enquiry:{fn:'hotel_update_enquiry',fields:[['p_property','uuid'],['p_enquiry','uuid'],['p_status','enquiry_status'],['p_note','note'],['p_version','version']]},
  set_room_rate:{fn:'set_room_nightly_rate',fields:[['p_property','uuid'],['p_room_type','uuid'],['p_rate_minor','money']]},
  create_menu_item:{fn:'create_hotel_menu_item',fields:[['p_property','uuid'],['p_name','name'],['p_price_minor','money'],['p_tracks_ingredients','boolean']]},
  create_stock_item:{fn:'create_hotel_stock_item',fields:[['p_property','uuid'],['p_sku','text'],['p_name','name'],['p_unit','text'],['p_reorder_level','quantity']]},
  set_recipe_ingredient:{fn:'set_hotel_recipe_ingredient',fields:[['p_property','uuid'],['p_menu_item','uuid'],['p_stock_item','uuid'],['p_quantity','quantity']]},
  stock_adjustment:{fn:'record_stock_adjustment',fields:[['p_property','uuid'],['p_item','uuid'],['p_delta','delta'],['p_reason','reason'],['p_request_key','uuid']]},
  open_restaurant_order:{fn:'open_restaurant_order',fields:[['p_property','uuid'],['p_table','uuid',true],['p_folio','uuid',true],['p_request_key','uuid']]},
  add_restaurant_item:{fn:'add_restaurant_item',fields:[['p_property','uuid'],['p_order','uuid'],['p_menu_item','uuid'],['p_quantity','quantity']]},
  create_restaurant_table:{fn:'create_hotel_restaurant_table',fields:[['p_property','uuid'],['p_label','text'],['p_seats','seats']]},
  set_room_condition:{fn:'set_hotel_room_condition',fields:[['p_property','uuid'],['p_room','uuid'],['p_condition','condition']]},
  finalize_restaurant_order:{fn:'finalize_restaurant_order',fields:[['p_property','uuid'],['p_order','uuid']]}
};

export class ApiError extends Error {
  readonly statusCode:number;
  constructor(statusCode:number,message:string){super(message);this.statusCode=statusCode;this.name='ApiError';}
}
function onlyString(v: string | string[] | undefined): string | undefined {return Array.isArray(v)?undefined:v;}
function check(type:ParamType,value:unknown):unknown {
  if(type==='boolean'){if(typeof value!=='boolean')throw new ApiError(422,'Invalid boolean field');return value;}
  if(type==='version'){
    if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>2147483646)throw new ApiError(422,'Invalid record version');
    return value;
  }
  if(type==='money'||type==='count'||type==='seats'){
    if(!Number.isSafeInteger(value)||Number(value)<0||(type==='count'&&(Number(value)<1||Number(value)>30))||(type==='seats'&&(Number(value)<1||Number(value)>40)))throw new ApiError(422,'Invalid amount or count');
    return value;
  }
  if(type==='quantity'||type==='delta'){
    if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e8||
      (type==='quantity'&&value<=0)||(type==='delta'&&value===0)||
      Math.round(value*1000)!==value*1000)throw new ApiError(422,'Invalid quantity');
    return value;
  }
  if(typeof value!=='string')throw new ApiError(422,'Expected a text field');
  const s=value.trim();
  if(type==='uuid'&&!uuid.test(s))throw new ApiError(422,'Invalid identifier');
  if(type==='date'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||
      new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new ApiError(422,'Invalid date');
  }
  if(type==='name'&&!nameRe.test(s))throw new ApiError(422,'Invalid name');
  if(type==='text'&&(s.length<1||s.length>120))throw new ApiError(422,'Invalid text field');
  if(type==='note'&&(s.length>2000||s.includes('\u0000')))throw new ApiError(422,'Internal note is too long or invalid');
  if(type==='enquiry_status'&&!['open','in_progress','resolved','cancelled'].includes(s))throw new ApiError(422,'Invalid enquiry status');
  if(type==='timezone'&&(s.length<2||s.length>80))throw new ApiError(422,'Invalid timezone');
  if(type==='role'&&!['manager','front_desk','restaurant','inventory','housekeeping','accountant'].includes(s))throw new ApiError(422,'Invalid role');
  if(type==='status'&&!['checked_in','checked_out','cancelled','no_show'].includes(s))throw new ApiError(422,'Invalid status');
  if(type==='reason'&&!['receipt','waste','adjustment','return'].includes(s))throw new ApiError(422,'Invalid reason');
  if(type==='condition'&&!['ready','dirty','cleaning','maintenance'].includes(s))throw new ApiError(422,'Invalid condition');
  if(type==='feature'&&!['reservations','restaurant','inventory','housekeeping','messaging','reporting'].includes(s))throw new ApiError(422,'Invalid feature');
  if(type==='email'&&(s.length>254||!/^\S+@\S+\.\S+$/.test(s)))throw new ApiError(422,'Invalid email');
  if(type==='phone'&&(s.length<7||s.length>25||!/^[+\d\s()\-]+$/.test(s)))throw new ApiError(422,'Invalid phone');
  return s;
}
export function validateAction(action:string,input:unknown):{fn:string;params:Record<string,unknown>}{
  const op=actions[action];if(!op)throw new ApiError(404,'Unknown action');
  if(typeof input!=='object'||!input||Array.isArray(input))throw new ApiError(400,'Expected a JSON object');
  const body=input as Record<string,unknown>;
  if(Object.keys(body).some(k=>!op.fields.some(([field])=>field===k)))throw new ApiError(422,'Unrecognized field');
  const params:Record<string,unknown>={};
  for(const [field,type,optional] of op.fields){
    if(body[field]===undefined||body[field]===null){
      if(!optional)throw new ApiError(422,'Missing '+field);
      if(Object.hasOwn(body,field))params[field]=null;
      continue;
    }
    params[field]=check(type,body[field]);
  }
  if(action==='create_reservation'&&String(params.p_check_out)<=String(params.p_check_in))throw new ApiError(422,'Departure must follow arrival');
  return {fn:op.fn,params};
}
function readBody(req:Incoming):unknown{
  const raw=req.body;
  if(typeof raw==='string'){
    if(raw.length>16000)throw new ApiError(413,'Request too large');
    try{return JSON.parse(raw);}catch{throw new ApiError(400,'Invalid JSON');}
  }
  if(raw&&JSON.stringify(raw).length>16000)throw new ApiError(413,'Request too large');
  return raw;
}
function apiConfig(env:Record<string,string|undefined>):{url:string;key:string}{
  const url=(env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/,'');
  const key=env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!url||!key||!/^https:\/\/[^/]+$/.test(url))throw new ApiError(503,'Hotel OS database is not configured');
  return {url,key};
}
function safeDatabaseError(code:string|undefined,message:string|undefined,status:number):ApiError{
  if(code==='42501'||status===401||status===403)return new ApiError(403,'Not authorized for this operation');
  if(code==='40001')return new ApiError(409,'This record changed. Refresh before saving.');
  if(code==='23505'||code==='23P01')return new ApiError(409,'A conflicting record already exists');
  const known=['No available room for these dates','Guest not found','Room type not found',
    'Room is not ready','Invalid status transition','Invalid stay dates','Room-service folio is not checked in',
    'Insufficient stock','Insufficient ingredient stock','Recipe missing for a stock-tracked item',
    'Order is not open','Restaurant disabled','Reservations disabled','Inventory disabled','Required stock item unavailable',
    'Reservation not found','Menu item not found','Unknown feature','Cannot finalize this order','Order has no items'];
  if(message&&known.includes(message))return new ApiError(message.startsWith('No available')?409:422,message);
  return new ApiError(status>=400&&status<500?422:502,'Unable to complete the requested operation');
}
function jsonHeaders(key:string,token:string):Record<string,string>{
  return {apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'};
}

export async function handleOperations(req:Incoming,res:Outgoing,env:Record<string,string|undefined>,request:Fetcher=fetch):Promise<void>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    const method=req.method?.toUpperCase();
    if(method!=='GET'&&method!=='POST'){
      res.setHeader('Allow','GET, POST');throw new ApiError(405,'Method not allowed');
    }
    const token=onlyString(req.headers.authorization)?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if(!token)throw new ApiError(401,'Authentication required');
    const {url,key}=apiConfig(env);
    const userResponse=await request(url+'/auth/v1/user',{headers:jsonHeaders(key,token),signal:AbortSignal.timeout(10000)});
    if(!userResponse.ok)throw new ApiError(401,'Invalid session');
    const user=await userResponse.json() as {id?:string};
    if(!user.id||!uuid.test(user.id))throw new ApiError(401,'Invalid session');
    if(method==='GET'){
      const resource=onlyString(req.query?.resource);
      if(!resource||!resources.has(resource)||!keyRe.test(resource))throw new ApiError(404,'Unknown resource');
      const property=onlyString(req.query?.property_id);
      if(resource!=='properties'&&(!property||!uuid.test(property)))throw new ApiError(422,'Property identifier required');
      const limitRaw=onlyString(req.query?.limit);
      const limit=limitRaw===undefined?50:Number(limitRaw);
      if(!Number.isInteger(limit)||limit<1||limit>100)throw new ApiError(422,'Invalid limit');
      const params=new URLSearchParams({select:'*',limit:String(limit)});
      if(resource!=='properties')params.set('property_id','eq.'+property);
      if(resource==='guest_enquiries')params.set('order','created_at.desc');
      const upstream=await request(url+'/rest/v1/'+resource+'?'+params,{headers:jsonHeaders(key,token),signal:AbortSignal.timeout(10000)});
      if(!upstream.ok){const error=await upstream.json().catch(()=>({}));throw safeDatabaseError(error.code,error.message,upstream.status);}
      res.status(200).json({data:await upstream.json()});return;
    }
    const action=onlyString(req.query?.action);
    if(!action)throw new ApiError(404,'Unknown action');
    const {fn,params}=validateAction(action,readBody(req));
    const upstream=await request(url+'/rest/v1/rpc/'+fn,{method:'POST',headers:jsonHeaders(key,token),body:JSON.stringify(params),signal:AbortSignal.timeout(15000)});
    if(!upstream.ok){const error=await upstream.json().catch(()=>({}));throw safeDatabaseError(error.code,error.message,upstream.status);}
    const responseText=await upstream.text();let result:unknown=null;
    if(responseText){try{result=JSON.parse(responseText);}catch{throw new ApiError(502,'Unexpected backend response');}}
    res.status(200).json({data:result});
  }catch(e){
    const error=e instanceof ApiError?e:new ApiError(502,'Backend is temporarily unavailable');
    res.status(error.statusCode).json({error:error.message});
  }
}
