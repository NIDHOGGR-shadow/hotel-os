import {handleGuestEnquiries} from '../server/guest-enquiries.js';
export default async function handler(req,res){return handleGuestEnquiries(req,res);}
