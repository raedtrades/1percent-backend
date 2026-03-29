console.log('Starting The1Percent Backend...');
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const NEWS_KEY = process.env.NEWS_API_KEY;

// ── SEND EMAIL ──
async function sendEmail(to, subject, html) {
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Raed The1Percent <raed@the1percentformula.com>',
      to: to,
      subject: subject,
      html: html
    }, {
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json'
      }
    });
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('Email error:', err.response ? JSON.stringify(err.response.data) : err.message);
  }
}


// ── ASSIGN DISCORD ROLE ──
async function assignDiscordRole(discordUserId, plan) {
  var roleId = plan === 'senales' ? process.env.DISCORD_ROLE_SENALES : process.env.DISCORD_ROLE_VIP;
  var guildId = process.env.DISCORD_GUILD_ID;
  var token = process.env.DISCORD_BOT_TOKEN;
  if (!roleId || !guildId || !token || !discordUserId) return;
  try {
    await axios.put(
      'https://discord.com/api/v10/guilds/' + guildId + '/members/' + discordUserId + '/roles/' + roleId,
      {},
      { headers: { 'Authorization': 'Bot ' + token, 'Content-Type': 'application/json' } }
    );
    console.log('Discord role assigned to:', discordUserId);
  } catch (err) {
    console.error('Discord error:', err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

// ── SEND DISCORD DM WITH INSTRUCTIONS ──
async function sendDiscordInstructions(discordUsername, customerEmail, plan) {
  console.log('Discord access pending for:', discordUsername, '-> plan:', plan);
}

// ── SAVE SUBSCRIBER TO SUPABASE ──
async function saveSubscriber(name, email) {
  try {
    await axios.post(SUPABASE_URL + '/rest/v1/subscribers', {
      name: name || '',
      email: email
    }, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });
    console.log('Subscriber saved:', email);
  } catch (err) {
    console.log('Subscriber may already exist:', email);
  }
}

// ── GET ALL SUBSCRIBERS FROM SUPABASE ──
async function getSubscribers() {
  try {
    var r = await axios.get(SUPABASE_URL + '/rest/v1/subscribers?select=name,email', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    });
    return r.data || [];
  } catch (err) {
    console.error('Error getting subscribers:', err.message);
    return [];
  }
}

// ── GET NEWS ──
async function getNews() {
  try {
    var queries = [
      'gold futures GC Comex',
      'Nasdaq futures NQ trading',
      'prop firm funded trader',
      'cryptocurrency USDT market'
    ];
    var allArticles = [];
    for (var i = 0; i < queries.length; i++) {
      var r = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: queries[i],
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 2,
          apiKey: NEWS_KEY
        }
      });
      if (r.data && r.data.articles) {
        allArticles = allArticles.concat(r.data.articles);
      }
    }
    return allArticles.slice(0, 8);
  } catch (err) {
    console.error('News error:', err.message);
    return [];
  }
}

// ── BUILD DAILY EMAIL ──
function buildDailyEmail(articles) {
  var date = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  var sections = {
    gold: articles.filter(function(a) { return a.title && (a.title.toLowerCase().includes('gold') || a.title.toLowerCase().includes('comex')); }),
    nasdaq: articles.filter(function(a) { return a.title && (a.title.toLowerCase().includes('nasdaq') || a.title.toLowerCase().includes('nq')); }),
    prop: articles.filter(function(a) { return a.title && (a.title.toLowerCase().includes('prop') || a.title.toLowerCase().includes('funded')); }),
    crypto: articles.filter(function(a) { return a.title && (a.title.toLowerCase().includes('crypto') || a.title.toLowerCase().includes('bitcoin') || a.title.toLowerCase().includes('usdt')); })
  };

  function articleHTML(a) {
    return '<div style="padding:16px 0;border-bottom:1px solid #222">' +
      '<a href="' + a.url + '" style="font-size:.95rem;font-weight:600;color:#C8A84B;text-decoration:none">' + a.title + '</a>' +
      '<p style="font-size:.82rem;color:#888;margin-top:6px;line-height:1.5">' + (a.description || '').substring(0, 120) + '...</p>' +
      '<span style="font-size:.7rem;color:#555">' + (a.source ? a.source.name : '') + '</span>' +
      '</div>';
  }

  function sectionHTML(title, emoji, items) {
    if (!items || items.length === 0) return '';
    return '<div style="margin-bottom:32px">' +
      '<h3 style="font-size:1rem;font-weight:700;color:#C8A84B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">' + emoji + ' ' + title + '</h3>' +
      items.map(articleHTML).join('') +
      '</div>';
  }

  return '<div style="max-width:600px;margin:0 auto;background:#0D0D10;font-family:Arial,sans-serif;color:#F0EBE0">' +
    '<div style="background:#060608;padding:32px;text-align:center;border-bottom:1px solid #C8A84B">' +
    '<h1 style="font-size:1.4rem;font-weight:700;color:#C8A84B;margin:0">The 1% Trading Formula</h1>' +
    '<p style="font-size:.8rem;color:#666;margin-top:8px">Analisis Diario de Mercados — ' + date + '</p>' +
    '</div>' +
    '<div style="padding:32px">' +
    sectionHTML('Oro · GC Comex', '🥇', sections.gold) +
    sectionHTML('Nasdaq · NQ Futuros', '📈', sections.nasdaq) +
    sectionHTML('Prop Firms · Funded Trading', '💼', sections.prop) +
    sectionHTML('Crypto · USDT Markets', '₿', sections.crypto) +
    '<div style="margin-top:32px;padding-top:24px;border-top:1px solid #222;text-align:center">' +
    '<a href="https://the1percentformula.com/#planes" style="background:#C8A84B;color:#060608;padding:14px 32px;text-decoration:none;font-weight:700;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase">Ver Planes →</a>' +
    '</div>' +
    '</div>' +
    '<div style="padding:20px;text-align:center;border-top:1px solid #222">' +
    '<p style="font-size:.7rem;color:#444">The 1% Trading Formula · the1percentformula.com</p>' +
    '</div>' +
    '</div>';
}

// ── SEND DAILY NEWSLETTER ──
async function sendDailyNewsletter() {
  console.log('Sending daily newsletter...');
  var subscribers = await getSubscribers();
  if (subscribers.length === 0) {
    console.log('No subscribers yet');
    return;
  }
  var articles = await getNews();
  if (articles.length === 0) {
    console.log('No news found');
    return;
  }
  var emailHTML = buildDailyEmail(articles);
  for (var i = 0; i < subscribers.length; i++) {
    await sendEmail(subscribers[i].email, 'Tu Analisis Diario de GC y Nasdaq — The1Percent', emailHTML);
    await new Promise(function(r) { setTimeout(r, 500); });
  }
  console.log('Newsletter sent to', subscribers.length, 'subscribers');
}

// ── SCHEDULE DAILY AT 8AM UTC (3AM Miami) ──
function scheduleDailyNewsletter() {
  var now = new Date();
  var next = new Date();
  next.setUTCHours(13, 0, 0, 0); // 8AM Miami = 1PM UTC
  if (next <= now) next.setDate(next.getDate() + 1);
  var msUntilNext = next - now;
  console.log('Next newsletter in', Math.round(msUntilNext / 1000 / 60), 'minutes');
  setTimeout(function() {
    sendDailyNewsletter();
    setInterval(sendDailyNewsletter, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

scheduleDailyNewsletter();

// ── ROUTES ──
app.get('/', function(req, res) {
  res.json({ status: 'The1Percent Backend online' });
});

app.post('/api/subscribe', async function(req, res) {
  var name = req.body.name;
  var email = req.body.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  await saveSubscriber(name, email);
  await sendEmail('raedtoken@gmail.com', 'Nuevo suscriptor The1Percent',
    '<h2>Nuevo suscriptor</h2><p><b>Nombre:</b> ' + (name || 'No indicado') + '</p><p><b>Email:</b> ' + email + '</p>'
  );
  await sendEmail(email, 'Bienvenido a The 1% Trading Formula',
    '<div style="max-width:600px;margin:0 auto;background:#0D0D10;font-family:Arial,sans-serif;color:#F0EBE0;padding:40px">' +
    '<h1 style="color:#C8A84B">Bienvenido ' + (name || '') + '</h1>' +
    '<p style="color:#888;line-height:1.7">Gracias por suscribirte. Desde manana recibiras mi analisis diario de GC Comex y Nasdaq, noticias de prop firms y oportunidades en crypto.</p>' +
    '<div style="margin-top:28px"><a href="https://the1percentformula.com/#planes" style="background:#C8A84B;color:#060608;padding:14px 28px;text-decoration:none;font-weight:700;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase">Ver los Planes →</a></div>' +
    '</div>'
  );
  return res.json({ ok: true });
});

app.post('/api/send-newsletter-now', async function(req, res) {
  await sendDailyNewsletter();
  return res.json({ ok: true, message: 'Newsletter sent' });
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
      plan: plan, planName: planName,
      customerEmail: customerEmail, customerName: customerName,
      whatsapp: whatsapp || null, discord: discord || null,
      amount: amount, status: 'waiting', createdAt: new Date()
    };
    var networks = {
      'usdtbsc': 'USDT BSC (BEP-20)', 'usdterc20': 'USDT ERC-20',
      'usdcerc20': 'USDC ERC-20', 'usdcbsc': 'USDC BSC'
    };
    return res.json({
      invoiceId: d.payment_id, payAddress: d.pay_address,
      payAmount: d.pay_amount, payCurrency: d.pay_currency.toUpperCase(),
      network: networks[d.pay_currency] || d.pay_currency.toUpperCase(),
      status: d.payment_status
    });
  } catch (err) {
    console.error('Invoice error:', err.response ? JSON.stringify(err.response.data) : err.message);
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
      await sendEmail('raedtoken@gmail.com',
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
      await sendEmail(invoice.customerEmail,
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
