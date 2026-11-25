import {handleFood,handleFoodReceipt} from '../server/food-purchases.js';
import {handlePublicAvailability} from '../server/public-booking.js';
import {handlePublicCatalog} from '../server/public-catalog.js';
import {handleGuestEnquiries} from '../server/guest-enquiries.js';
export default async function handler(req,res){
 const service=req.query?.service;
 if(service==='food')return handleFood(req,res);
 if(service==='food-receipt')return handleFoodReceipt(req,res);
 if(service==='catalog')return handlePublicCatalog(req,res);
 if(service==='enquiries')return handleGuestEnquiries(req,res);
 if(service!==undefined)return res.status(400).json({error:'Unknown public service'});
 return handlePublicAvailability(req,res);
}
