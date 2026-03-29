console.log('Starting server...');
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
 
async function sendEmail(to, subject, html) {
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Raed The1Percent <raed@the1percentformula.com>',
      to: to,
      subject: subject,
      html: html
    }, {
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('Email error:', err.response ? err.response.data : err.message);
  }
}
 
app.get('/', function(req, res) {
  res.json({ status: 'The1Percent Backend online' });
});
 
app.post('/api/subscribe', async function(req, res) {
  var name = req.body.name;
  var email = req.body.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  console.log('New subscriber:', email);
  await sendEmail(
    'raedtoken@gmail.com',
    'Nuevo suscriptor The1Percent',
    '<h2>Nuevo suscriptor</h2><p><b>Nombre:</b> ' + (name || 'No indicado') + '</p><p><b>Email:</b> ' + email + '</p>'
  );
  return res.json({ ok: true });
});
 
app.post('/api/create-invoice', async function(req, res) {
  var plan = req.body.plan;
  var planName = req.body.planName;
  var amount = req.body.amount;
  var payCurrency = req.body.payCurrency;
  var customerEmail = req.body.customerEmail;
  var customerName = req.body.customerName;
  var whatsapp = req.body.whatsapp;
  var discord = req.body.discord;
 
  if (!plan || !amount || !customerEmail) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
 
  try {
    var payment = await axios.post(NP_API + '/payment', {
      price_amount: amount,
      price_currency: 'usd',
      pay_currency: payCurrency || 'usdtbsc',
      order_id: plan + '-' + Date.now(),
      order_description: 'The1Percent - ' + planName,
      ipn_callback_url: process.env.BACKEND_URL + '/api/webhook/nowpayments',
      success_url: process.env.FRONTEND_URL + '?success=1',
      cancel_url: process.env.FRONTEND_URL
    }, { headers: NP_HEADERS });
 
    var d = payment.data;
    invoiceStore[d.payment_id] = {
      plan: plan,
      planName: planName,
      customerEmail: customerEmail,
      customerName: customerName,
      whatsapp: whatsapp || null,
      discord: discord || null,
      amount: amount,
      status: 'waiting',
      createdAt: new Date()
    };
 
    var networks = {
      'usdtbsc': 'USDT BSC (BEP-20)',
      'usdterc20': 'USDT ERC-20 (Ethereum)',
      'usdcerc20': 'USDC ERC-20 (Ethereum)',
      'usdcbsc': 'USDC BSC (BEP-20)'
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
    console.error('Invoice error:', err.response ? err.response.data : err.message);
    return res.status(500).json({ error: 'Error al crear invoice' });
  }
});
 
app.get('/api/payment-status/:invoiceId', async function(req, res) {
  try {
    var r = await axios.get(NP_API + '/payment/' + req.params.invoiceId, { headers: NP_HEADERS });
    return res.json({ status: r.data.payment_status });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo obtener el status' });
  }
});
 
app.post('/api/webhook/nowpayments', express.raw({ type: 'application/json' }), async function(req, res) {
  var signature = req.headers['x-nowpayments-sig'];
  var rawBody = req.body.toString('utf8');
  var hmac = crypto.createHmac('sha512', process.env.NOW_PAYMENTS_IPN_SECRET || '').update(rawBody).digest('hex');
  if (signature && hmac !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
 
  var data = JSON.parse(rawBody);
  var payment_id = data.payment_id;
  var payment_status = data.payment_status;
  console.log('Webhook:', payment_id, '->', payment_status);
 
  if (payment_status === 'finished' || payment_status === 'confirmed') {
    var invoice = invoiceStore[payment_id];
    if (invoice && invoice.status !== 'processed') {
      invoiceStore[payment_id].status = 'processed';
 
      await sendEmail(
        'raedtoken@gmail.com',
        'PAGO CONFIRMADO ' + invoice.planName + ' $' + invoice.amount,
        '<h2 style="color:#C8A84B">Nuevo pago confirmado</h2>' +
        '<p><b>Plan:</b> ' + invoice.planName + '</p>' +
        '<p><b>Monto:</b> $' + invoice.amount + ' USD</p>' +
        '<p><b>Cliente:</b> ' + invoice.customerName + '</p>' +
        '<p><b>Email:</b> ' + invoice.customerEmail + '</p>' +
        '<p><b>WhatsApp:</b> ' + (invoice.whatsapp || 'No indicado') + '</p>' +
        '<p><b>Discord:</b> ' + (invoice.discord || 'No indicado') + '</p>' +
        '<hr><p style="color:#C8A84B"><b>Agrega al cliente a WhatsApp o Discord segun el plan.</b></p>'
      );
 
      await sendEmail(
        invoice.customerEmail,
        'Pago confirmado The 1% Trading Formula',
        '<h2>Hola ' + invoice.customerName + '</h2>' +
        '<p>Tu pago de $' + invoice.amount + ' USD para el plan ' + invoice.planName + ' fue confirmado.</p>' +
        '<p>Raed se pondra en contacto contigo en los proximos minutos.</p>' +
        '<p>Preguntas: raedtoken@gmail.com</p>' +
        '<p>The 1% Trading Formula</p>'
      );
    }
  }
  return res.status(200).json({ received: true });
});
 
var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
 
