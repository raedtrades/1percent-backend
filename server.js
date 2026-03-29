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

// ── EMAIL TEMPLATES ──
function emailWrapper(content) {
  return '<div style="max-width:600px;margin:0 auto;background:#0D0D10;font-family:Arial,sans-serif;color:#F0EBE0">' +
    '<div style="background:#060608;padding:28px 32px;text-align:center;border-bottom:2px solid #C8A84B">' +
    '<h1 style="font-size:1.3rem;font-weight:700;color:#C8A84B;margin:0">The 1% Trading Formula</h1>' +
    '</div>' +
    '<div style="padding:36px 32px">' + content + '</div>' +
    '<div style="padding:20px 32px;border-top:1px solid #222;text-align:center">' +
    '<p style="font-size:.7rem;color:#444">The 1% Trading Formula · the1percentformula.com · @raedtrades_</p>' +
    '</div></div>';
}

function refLink(platform, url, code, discount, description, cta) {
  return '<div style="background:#111;border:1px solid #C8A84B22;padding:20px 24px;margin-bottom:16px;border-radius:2px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
    '<div>' +
    '<div style="font-size:.65rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#C8A84B;margin-bottom:6px">' + platform + '</div>' +
    '<p style="font-size:.88rem;color:#999;line-height:1.6;margin-bottom:12px">' + description + '</p>' +
    (code ? '<div style="background:#060608;border:1px solid #C8A84B44;padding:8px 14px;display:inline-block;margin-bottom:12px">' +
    '<span style="font-size:.7rem;color:#888">Codigo: </span><strong style="color:#C8A84B;font-size:.9rem;letter-spacing:.1em">' + code + '</strong>' +
    (discount ? '<span style="color:#22c55e;font-size:.75rem;margin-left:8px">' + discount + '</span>' : '') +
    '</div>' : '') +
    '</div></div>' +
    '<a href="' + url + '" style="display:inline-block;background:#C8A84B;color:#060608;text-decoration:none;padding:10px 20px;font-weight:700;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase">' + cta + ' →</a>' +
    '</div>';
}

// Email 1: Bienvenida inmediata
async function sendWelcomeEmail(name, email) {
  var content = '<h2 style="font-size:1.6rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Bienvenido ' + (name || '') + ' 🐂</h2>' +
    '<p style="color:#888;line-height:1.7;margin-bottom:28px">Gracias por unirte. Desde manana recibiras mi analisis diario de GC Comex y Nasdaq. Mientras tanto, aqui tienes mis recursos exclusivos:</p>' +
    refLink('Tradeify — Prop Firm', 'https://tradeify.co/?ref=BTER2VJV', 'RAED', '30% de descuento', 'La prop firm que uso para operar GC y Nasdaq. Evaluaciones rapidas y payouts semanales.', 'Abrir cuenta con 30% OFF') +
    refLink('My Funded Futures', 'https://myfundedfutures.com/challenge?ref=4982', 'RAED', '15% de descuento', 'Con MFF genere $5,309 en payouts en un solo mes con una sola cuenta.', 'Abrir cuenta con 15% OFF') +
    refLink('Bitget Exchange', 'https://partner.bitget.com/bg/tq288019', null, null, 'Registrate con mi link y obtén acceso VIP + copy trading en PAXG (oro en crypto).', 'Registrarse en Bitget') +
    refLink('EtherFi Card', 'https://www.ether.fi/refer/RAED', null, null, 'La tarjeta que uso para gastar mis ganancias en USDT sin convertir a fiat.', 'Solicitar tarjeta') +
    '<div style="margin-top:28px;text-align:center"><a href="https://the1percentformula.com/#planes" style="background:#C8A84B;color:#060608;padding:14px 28px;text-decoration:none;font-weight:700;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase">Ver los Planes →</a></div>';
  await sendEmail(email, 'Bienvenido — Tus recursos exclusivos de trading', emailWrapper(content));
}

// Email 2 (dia 2): Recordatorio Tradeify
async function sendTradeifyReminder(name, email) {
  var content = '<h2 style="font-size:1.5rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Hola ' + (name || '') + ', recuerda esto 👇</h2>' +
    '<p style="color:#888;line-height:1.7;margin-bottom:24px">Con el codigo <strong style="color:#C8A84B">RAED</strong> tienes <strong style="color:#22c55e">30% de descuento</strong> en Tradeify — la prop firm que yo uso para operar GC y Nasdaq en vivo.</p>' +
    '<div style="background:#111;border-left:3px solid #C8A84B;padding:20px 24px;margin-bottom:24px">' +
    '<p style="font-size:.88rem;color:#999;line-height:1.7">Tradeify me da acceso a cuentas de hasta $200K para operar futuros. Sus evaluaciones son rapidas y los payouts llegan semanalmente. Es la firma con la que trabajo activamente.</p>' +
    '</div>' +
    refLink('Tradeify', 'https://tradeify.co/?ref=BTER2VJV', 'RAED', '30% de descuento', 'Codigo valido para cualquier cuenta. No lo dejes pasar.', 'Aplicar descuento ahora');
  await sendEmail(email, '🔥 Codigo RAED — 30% OFF en Tradeify (recuerdalo)', emailWrapper(content));
}

// Email 3 (dia 4): Recordatorio Bitget + PAXG
async function sendBitgetReminder(name, email) {
  var content = '<h2 style="font-size:1.5rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Copia mis trades en Bitget 📈</h2>' +
    '<p style="color:#888;line-height:1.7;margin-bottom:24px">Sabias que en Bitget puedes copiar automaticamente las senales del Grupo de Oro operando <strong style="color:#C8A84B">PAXG</strong> — una crypto que replica exactamente la grafica del oro?</p>' +
    '<div style="background:#111;border-left:3px solid #C8A84B;padding:20px 24px;margin-bottom:24px">' +
    '<p style="font-size:.88rem;color:#999;line-height:1.7;margin-bottom:8px"><strong style="color:#F0EBE0">PAXG (PAX Gold)</strong> es un token respaldado por oro fisico que replica el movimiento del XAU/USD. Puedes operarlo en Bitget con copy trading — automatico, sin estar frente a la pantalla.</p>' +
    '<p style="font-size:.88rem;color:#999;line-height:1.7">Registrate con mi link, activa el copy trading y sigues mis operaciones automaticamente.</p>' +
    '</div>' +
    refLink('Bitget Exchange', 'https://partner.bitget.com/bg/tq288019', null, null, 'Acceso VIP + copy trading activado desde el primer dia.', 'Registrarse en Bitget');
  await sendEmail(email, '📊 Copia mis trades en oro automaticamente — Bitget + PAXG', emailWrapper(content));
}

// Email 4 (dia 7): Oferta planes
async function sendPlansReminder(name, email) {
  var content = '<h2 style="font-size:1.5rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Una semana en la comunidad 🐂</h2>' +
    '<p style="color:#888;line-height:1.7;margin-bottom:24px">Ya llevas una semana recibiendo mi analisis diario de GC y Nasdaq. Si quieres el siguiente nivel — mis senales en vivo con entrada, SL y TP exactos — los planes estan disponibles:</p>' +
    '<div style="display:grid;gap:12px;margin-bottom:28px">' +
    '<div style="background:#111;border:1px solid #C8A84B22;padding:20px 24px"><div style="color:#C8A84B;font-weight:700;margin-bottom:4px">Senales del Oro — $300/mes</div><p style="font-size:.85rem;color:#888">3-5 senales semanales de GC y Nasdaq con entrada, SL y TP. Directo a tu WhatsApp.</p></div>' +
    '<div style="background:#18181C;border:1px solid #C8A84B55;padding:20px 24px"><div style="color:#C8A84B;font-weight:700;margin-bottom:4px">Sala Operativa — $600/mes ⭐</div><p style="font-size:.85rem;color:#888">Todo lo anterior + sala de Discord en vivo donde ves cada trade en tiempo real.</p></div>' +
    '<div style="background:#111;border:1px solid #C8A84B22;padding:20px 24px"><div style="color:#C8A84B;font-weight:700;margin-bottom:4px">VIP — $3,000/mes</div><p style="font-size:.85rem;color:#888">Acceso completo + sesion 1:1 mensual conmigo para revisar tu cuenta.</p></div>' +
    '</div>' +
    '<div style="text-align:center"><a href="https://the1percentformula.com/#planes" style="background:#C8A84B;color:#060608;padding:14px 32px;text-decoration:none;font-weight:700;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase">Unirme ahora →</a></div>';
  await sendEmail(email, '¿Listo para el siguiente nivel? — Planes disponibles', emailWrapper(content));
}

// Schedule follow-up emails
function scheduleFollowUps(name, email) {
  // Day 2
  setTimeout(async function() {
    await sendTradeifyReminder(name, email);
  }, 2 * 24 * 60 * 60 * 1000);
  // Day 4
  setTimeout(async function() {
    await sendBitgetReminder(name, email);
  }, 4 * 24 * 60 * 60 * 1000);
  // Day 7
  setTimeout(async function() {
    await sendPlansReminder(name, email);
  }, 7 * 24 * 60 * 60 * 1000);
}

app.post('/api/subscribe', async function(req, res) {
  var name = req.body.name;
  var email = req.body.email;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  await saveSubscriber(name, email);
  await sendEmail('raedtoken@gmail.com', 'Nuevo suscriptor The1Percent',
    '<h2>Nuevo suscriptor</h2><p><b>Nombre:</b> ' + (name || 'No indicado') + '</p><p><b>Email:</b> ' + email + '</p>'
  );
  await sendWelcomeEmail(name, email);
  scheduleFollowUps(name, email);
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
