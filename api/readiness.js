import {handleReadiness} from '../server/readiness.js';
export default async function handler(req,res){return handleReadiness(req,res);}
