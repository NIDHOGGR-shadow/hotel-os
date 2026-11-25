import staffConfig from '../server/staff-config.js';
import {handleStaffInvite} from '../server/staff-invitations.js';
import {handleReceiptVerification,handleFoodOrderList} from '../server/receipt-verification.js';
import {handleAdminReconciliation} from '../server/staff-reconciliation.js';
export default async function handler(req,res){return req.query?.service==='staff-config'?staffConfig(req,res):req.query?.service==='staff-invite'?handleStaffInvite(req,res):req.query?.service==='food-orders'?handleFoodOrderList(req,res):req.query?.service==='receipt'?handleReceiptVerification(req,res):handleAdminReconciliation(req,res);}
