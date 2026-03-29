// ============================================================
// GoldSignals — Backend (Node.js / Express)
// ============================================================
// Instalar dependencias:
//   npm install express axios crypto-js dotenv cors
//
// Variables de entorno (.env):
//   NOW_PAYMENTS_API_KEY=tu_api_key_de_nowpayments
//   NOW_PAYMENTS_IPN_SECRET=tu_secret_de_webhook
//   DISCORD_BOT_TOKEN=tu_bot_token
//   DISCORD_GUILD_ID=id_de_tu_servidor
//   DISCORD_ROLE_SALA=id_del_rol_sala_operativa
//   DISCORD_ROLE_VIP=id_del_rol_vip
//   WHATSAPP_INVITE_SENALES=link_de_invitacion_fijo_whatsapp
//   WHATSAPP_INVITE_VIP=link_de_invitacion_fijo_whatsapp_vip
//   PORT=3000
// ============================================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store para invoices (usa Redis o DB en producción)
const invoiceStore = {};

// ── NOWPAYMENTS CONFIG ──
const NP_API = 'https://api.nowpayments.io/v1';
const NP_HEADERS = {
  'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
  'Content-Type': 'application/json'
};

// ============================================================
// POST /api/create-invoice
// Crea un payment en NOWPayments y devuelve los datos al frontend
// ============================================================
app.post('/api/create-invoice', async (req, res) => {
  const { plan, planName, amount, payCurrency, customerEmail, customerName, whatsapp, discord } = req.body;

  if (!plan || !amount || !customerEmail) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    // Crear pago en NOWPayments
    const payment = await axios.post(`${NP_API}/payment`, {
      price_amount: amount,
      price_currency: 'usd',
      pay_currency: payCurrency || 'usdttrc20',
      order_id: `${plan}-${Date.now()}`,
      order_description: `GoldSignals - ${planName}`,
      ipn_callback_url: `${process.env.BACKEND_URL}/api/webhook/nowpayments`,
      success_url: `${process.env.FRONTEND_URL}?success=1`,
      cancel_url: `${process.env.FRONTEND_URL}`
    }, { headers: NP_HEADERS });

    const paymentData = payment.data;

    // Guardar metadata del cliente con el payment_id
    invoiceStore[paymentData.payment_id] = {
      plan,
      planName,
      customerEmail,
      customerName,
      whatsapp: whatsapp || null,
      discord: discord || null,
      status: 'waiting',
      createdAt: new Date()
    };

    console.log(`[Invoice] Creado: ${paymentData.payment_id} | Plan: ${plan} | ${customerEmail}`);

    return res.json({
      invoiceId: paymentData.payment_id,
      payAddress: paymentData.pay_address,
      payAmount: paymentData.pay_amount,
      payCurrency: paymentData.pay_currency.toUpperCase(),
      network: getNetworkName(paymentData.pay_currency),
      status: paymentData.payment_status
    });

  } catch (err) {
    console.error('[Invoice] Error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Error al crear el invoice' });
  }
});

// ============================================================
// GET /api/payment-status/:invoiceId
// El frontend hace polling para saber si el pago fue confirmado
// ============================================================
app.get('/api/payment-status/:invoiceId', async (req, res) => {
  const { invoiceId } = req.params;

  try {
    const status = await axios.get(`${NP_API}/payment/${invoiceId}`, { headers: NP_HEADERS });
    return res.json({ status: status.data.payment_status });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo obtener el status' });
  }
});

// ============================================================
// POST /api/webhook/nowpayments
// NOWPayments llama a esta URL cuando el pago cambia de estado
// ============================================================
app.post('/api/webhook/nowpayments', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Verificar firma del webhook
  const signature = req.headers['x-nowpayments-sig'];
  const rawBody = req.body.toString('utf8');

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[Webhook] Firma inválida — ignorando request');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const data = JSON.parse(rawBody);
  const { payment_id, payment_status, order_id } = data;

  console.log(`[Webhook] ${payment_id} → Status: ${payment_status}`);

  // 2. Solo procesar cuando el pago está confirmado
  if (payment_status === 'finished' || payment_status === 'confirmed') {
    const invoice = invoiceStore[payment_id];

    if (!invoice) {
      console.warn(`[Webhook] Invoice no encontrado: ${payment_id}`);
      return res.status(200).json({ received: true });
    }

    if (invoice.status === 'processed') {
      console.log(`[Webhook] Invoice ya procesado: ${payment_id}`);
      return res.status(200).json({ received: true });
    }

    // 3. Marcar como procesado (evitar duplicados)
    invoiceStore[payment_id].status = 'processed';

    // 4. Ejecutar acciones según el plan
    try {
      await processAccess(invoice);
      console.log(`[Webhook] ✓ Acceso otorgado: ${invoice.customerEmail} → ${invoice.plan}`);
    } catch (err) {
      console.error(`[Webhook] Error al otorgar acceso: ${err.message}`);
    }
  }

  return res.status(200).json({ received: true });
});

// ============================================================
// FUNCIÓN: Otorgar acceso según el plan
// ============================================================
async function processAccess(invoice) {
  const { plan, customerEmail, customerName, whatsapp, discord } = invoice;

  const actions = [];

  // Señales del Oro → WhatsApp
  if (plan === 'senales' || plan === 'vip') {
    if (whatsapp) {
      actions.push(sendWhatsAppInvite(whatsapp, customerName, plan));
    }
    actions.push(sendConfirmationEmail(customerEmail, customerName, plan));
  }

  // Sala Operativa → Discord
  if (plan === 'sala' || plan === 'vip') {
    if (discord) {
      // Nota: Para asignar rol en Discord necesitas que el usuario esté en tu servidor
      // La mejor práctica es enviarles un link de OAuth2 con add role
      actions.push(sendDiscordInvite(customerEmail, customerName, plan));
    }
    actions.push(sendConfirmationEmail(customerEmail, customerName, plan));
  }

  await Promise.allSettled(actions);
}

// ============================================================
// WHATSAPP: Enviar link de invitación via WhatsApp Business API
// ── Opción A: Twilio (más fácil para empezar)
// ── Opción B: Meta Business API (oficial)
// ============================================================
async function sendWhatsAppInvite(phone, name, plan) {
  const inviteLink = plan === 'vip'
    ? process.env.WHATSAPP_INVITE_VIP
    : process.env.WHATSAPP_INVITE_SENALES;

  const message = `¡Hola ${name}! 👋\n\n✅ Tu pago fue confirmado.\n\nAquí está tu link de acceso al grupo de *Señales del Oro*:\n${inviteLink}\n\n⚠️ Este link es personal, no lo compartas.`;

  // ── TWILIO ──
  // npm install twilio
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   from: 'whatsapp:+14155238886', // Twilio sandbox o tu número aprobado
  //   to: `whatsapp:${phone}`,
  //   body: message
  // });

  // ── META BUSINESS API ──
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

  await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: message }
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  console.log(`[WhatsApp] ✓ Mensaje enviado a ${phone}`);
}

// ============================================================
// DISCORD: Asignar rol via Bot
// El flujo recomendado:
//   1. El usuario entra a tu servidor con el link de invitación
//   2. Usa el comando /verificar o escribe su email
//   3. El bot busca en tu DB y asigna el rol automáticamente
// ============================================================
async function sendDiscordInvite(email, name, plan) {
  // Enviar email con instrucciones para que el usuario vaya a Discord
  // y use el comando de verificación del bot

  const roleId = plan === 'vip'
    ? process.env.DISCORD_ROLE_VIP
    : process.env.DISCORD_ROLE_SALA;

  // Guardar en DB que este email tiene pendiente el rol X
  // Tu bot de Discord luego lo asigna cuando el usuario se une y verifica

  // ── ASIGNACIÓN DIRECTA (si ya tienes el Discord ID del usuario) ──
  // await axios.put(
  //   `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
  //   {},
  //   { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  // );

  console.log(`[Discord] ✓ Rol pendiente guardado para: ${email} → ${plan}`);
}

// ============================================================
// EMAIL: Confirmación de pago (usar Resend, SendGrid o Nodemailer)
// ============================================================
async function sendConfirmationEmail(email, name, plan) {
  const planMessages = {
    senales: 'Recibirás el link de WhatsApp en los próximos minutos.',
    sala: 'Recibirás instrucciones para acceder a Discord en los próximos minutos.',
    vip: 'Recibirás los links de WhatsApp y Discord. Un asesor se contactará contigo.'
  };

  // ── RESEND (recomendado, muy fácil) ──
  // npm install resend
  // const { Resend } = require('resend');
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'GoldSignals <noreply@tusitio.com>',
  //   to: email,
  //   subject: '✅ Pago confirmado — GoldSignals',
  //   html: `<h2>¡Hola ${name}!</h2><p>Tu pago fue confirmado exitosamente.</p><p>${planMessages[plan]}</p>`
  // });

  console.log(`[Email] ✓ Confirmación enviada a ${email}`);
}

// ============================================================
// UTILS
// ============================================================
function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !process.env.NOW_PAYMENTS_IPN_SECRET) return false;
  const hmac = crypto
    .createHmac('sha512', process.env.NOW_PAYMENTS_IPN_SECRET)
    .update(rawBody)
    .digest('hex');
  return hmac === signature;
}

function getNetworkName(currency) {
  const networks = {
    'usdttrc20': 'USDT · TRC-20 (Tron)',
    'usdterc20': 'USDT · ERC-20 (Ethereum)',
    'btc': 'Bitcoin Network',
    'eth': 'Ethereum Network',
    'sol': 'Solana Network',
    'bnbbsc': 'BNB · BSC',
    'usdcpolygon': 'USDC · Polygon'
  };
  return networks[currency?.toLowerCase()] || currency?.toUpperCase() || '—';
}

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════╗
  ║  GoldSignals Backend           ║
  ║  Puerto: ${PORT}                   ║
  ║  Webhook: /api/webhook/now...  ║
  ╚════════════════════════════════╝
  `);
});

module.exports = app;
