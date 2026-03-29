require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const invoiceStore = {};

const NP_API = 'https://api.nowpayments.io/v1';
const NP_HEADERS = {
  'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
  'Content-Type': 'application/json'
};

app.get('/', (req, res) => {
  res.json({ status: 'The1Percent Backend online' });
});

app.post('/api/create-invoice', async (req, res) => {
  const { plan, planName, amount, payCurrency, customerEmail, customerName, whatsapp, discord } = req.body;
  if (!plan || !amount || !customerEmail) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  try {
    const payment = await axios.post(`${NP_API}/payment`, {
      price_amount: amount,
      price_currency: 'usd',
      pay_currency: payCurrency || 'usdttrc20',
      order_id: `${plan}-${Date.now()}`,
      order_description: `The1Percent - ${planName}`,
      ipn_callback_url: `${process.env.BACKEND_URL}/api/webhook/nowpayments`,
      success_url: `${process.env.FRONTEND_URL}?success=1`,
      cancel_url: process.env.FRONTEND_URL
    }, { headers: NP_HEADERS });

    const d = payment.data;
    invoiceStore[d.payment_id] = {
      plan, planName, customerEmail, customerName,
      whatsapp: whatsapp || null, discord: discord || null,
      status: 'waiting', createdAt: new Date()
    };

    const networks = {
      'usdttrc20': 'TRC-20 (Tron)', 'usdterc20': 'ERC-20 (Ethereum)',
      'usdcpolygon': 'USDC · Polygon', 'usdcerc20': 'USDC · ERC-20'
    };

    return res.json({
      invoiceId: d.payment_id,
      payAddress: d.pay_address,
      payAmount: d.pay_amount,
      payCurrency: d.pay_currency.toUpperCase(),
      network: networks[d.pay_currency] || d.pay_currency.toUpperCase(),
      status: d.payment_status
    });
  } catch (err) {
    console.error('Invoice error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Error al crear invoice' });
  }
});

app.get('/api/payment-status/:invoiceId', async (req, res) => {
  try {
    const r = await axios.get(`${NP_API}/payment/${req.params.invoiceId}`, { headers: NP_HEADERS });
    return res.json({ status: r.data.payment_status });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo obtener el status' });
  }
});

app.post('/api/webhook/nowpayments', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-nowpayments-sig'];
  const rawBody = req.body.toString('utf8');
  const hmac = crypto.createHmac('sha512', process.env.NOW_PAYMENTS_IPN_SECRET || '').update(rawBody).digest('hex');
  if (signature && hmac !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const data = JSON.parse(rawBody);
  const { payment_id, payment_status } = data;
  console.log(`Webhook: ${payment_id} -> ${payment_status}`);
  if (payment_status === 'finished' || payment_status === 'confirmed') {
    const invoice = invoiceStore[payment_id];
    if (invoice && invoice.status !== 'processed') {
      invoiceStore[payment_id].status = 'processed';
      console.log(`Acceso otorgado: ${invoice.customerEmail} -> ${invoice.plan}`);
    }
  }
  return res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
