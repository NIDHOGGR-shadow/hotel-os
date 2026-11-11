declare const process: {env:Record<string,string|undefined>};
import {handleOperations} from '../server/api-core.js';
import type {Incoming,Outgoing} from '../server/api-core.js';

export default async function handler(req:Incoming,res:Outgoing):Promise<void>{
  await handleOperations(req,res,process.env);
}
