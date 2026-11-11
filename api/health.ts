import type {Incoming,Outgoing} from '../server/api-core.js';
export default async function handler(req:Incoming,res:Outgoing):Promise<void>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.status(405).json({error:'Method not allowed'});return;}
  res.status(200).json({service:'hotel-os',status:'online'});
}
