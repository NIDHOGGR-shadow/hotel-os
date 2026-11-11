import {handlePublicAvailability} from '../server/public-booking.js';
export default async function handler(req,res){return handlePublicAvailability(req,res);}
