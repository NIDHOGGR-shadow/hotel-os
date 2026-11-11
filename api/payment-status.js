import {handlePaystackStatus} from '../server/paystack-status.js';

export default async function handler(req, res) {
  return handlePaystackStatus(req, res);
}
