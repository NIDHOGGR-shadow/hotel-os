import {handleStaffLogin} from '../server/staff-reconciliation.js';
export default async function handler(req,res){return handleStaffLogin(req,res);}
