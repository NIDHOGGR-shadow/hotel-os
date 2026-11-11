import {handlePaystackCheckout} from '../server/public-booking.js';
export default async function handler(req,res){return handlePaystackCheckout(req,res);}
