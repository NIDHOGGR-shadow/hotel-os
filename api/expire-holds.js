import {handleExpireHolds} from '../server/hold-expiration.js';

export default async function handler(req,res){
  return handleExpireHolds(req,res);
}
