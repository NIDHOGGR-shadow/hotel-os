import {handlePaystackWebhook} from '../server/paystack-webhook.js';

// The raw bytes are essential for Paystack's signature verification.
export const config = {api: {bodyParser: false}};

export default async function handler(req, res) {
  return handlePaystackWebhook(req, res);
}
