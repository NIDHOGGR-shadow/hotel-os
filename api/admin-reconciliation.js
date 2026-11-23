import {handleAdminReconciliation} from '../server/staff-reconciliation.js';
export default async function handler(req,res){return handleAdminReconciliation(req,res);}
