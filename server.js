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
    '<div style="margin-top:32px;padding-top:24px;border-top:1px solid #C8A84B22">' +
    (function() {
      var g = getGalletaDelDia();
      return '<div style="background:#111;border:1px solid #C8A84B33;padding:24px 28px;margin-bottom:28px;text-align:center">' +
        '<div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#C8A84B;font-family:monospace;margin-bottom:12px;opacity:0.7">🥠 Tu galleta de la fortuna del dia</div>' +
        '<div style="font-size:36px;color:#C8A84B;margin-bottom:10px;opacity:0.6">' + g.kanji + '</div>' +
        '<div style="font-size:1rem;font-style:italic;color:#F0EBE0;margin-bottom:10px;font-family:Georgia,serif">\"' + g.paper + '\"</div>' +
        '<div style="width:30px;height:1px;background:#C8A84B;margin:12px auto;opacity:0.4"></div>' +
        '<p style="font-size:.85rem;color:#888;line-height:1.7;max-width:400px;margin:0 auto">' + g.msg + '</p>' +
        '<div style="margin-top:12px;font-size:9px;color:#555;font-family:monospace;letter-spacing:0.15em;text-transform:uppercase">' + g.tipo + ' · @raedtrades</div>' +
        '</div>';
    })() +
    '<div style="text-align:center;margin-bottom:16px">' +
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

// ── GALLETA MESSAGES ──
var galletaMsgs = [
  {kanji:"急", paper:"Sigues mirando el mercado desde afuera.", msg:"Llevas meses diciendo 'cuando aprenda más, empiezo'. El mercado no te va a esperar. Cada día sin operar es dinero que no existe.", tipo:"Urgencia"},
  {kanji:"道", paper:"El agua no lucha. Fluye.", msg:"Tao Te Ching: 'Lo más blando vence a lo más duro.' El trader que fluye con el mercado en vez de luchar contra él es el que retira.", tipo:"道 · Tao"},
  {kanji:"師", paper:"Tu gurú tiene más alumnos que trades.", msg:"Si el que te enseña trading vive de vender cursos... te está enseñando a pagar cursos. No a ganar en el mercado.", tipo:"Humor"},
  {kanji:"知", paper:"Conocerte vale más que cualquier estrategia.", msg:"Lao Tzu: 'Conocer a los demás es inteligencia. Conocerse a uno mismo es iluminación.' El trader que conoce sus emociones ya ganó la mitad.", tipo:"道 · Tao"},
  {kanji:"机", paper:"Con $100 tienes acceso a $50,000 real.", msg:"No es publicidad. Así funcionan las prop firms. Tú pones la habilidad. Ellos el capital. ¿Cuánto tiempo más vas a ignorar esto?", tipo:"Dato Real"},
  {kanji:"贪", paper:"Abriste 8 trades. Cerraste 7 en rojo.", msg:"El overtrade es la adicción más cara del trading. 3 trades buenos a la semana valen más que 20 operaciones por aburrimiento.", tipo:"Error Clásico"},
  {kanji:"虚", paper:"El vacío entre trades tiene valor.", msg:"Tao Te Ching: 'El vacío dentro de una taza es lo que la hace útil.' La paciencia entre tus trades es lo que los hace rentables.", tipo:"道 · Tao"},
  {kanji:"时", paper:"Mientras lees esto hay traders retirando.", msg:"No porque sean más inteligentes. Porque empezaron antes que tú. El mejor momento fue hace un año. El segundo mejor momento es hoy.", tipo:"Urgencia"},
  {kanji:"护", paper:"Tu stop loss no es una derrota.", msg:"El trader que no usa stop loss es el mismo que después dice 'perdí todo en una operación'. El SL no te hace perder. Te mantiene en el juego.", tipo:"Error Clásico"},
  {kanji:"警", paper:"Pagaste señales. Sigues en rojo.", msg:"Si quien te da señales no puede mostrarte certificados reales de cuentas fondeadas... le estás pagando por sus opiniones. No por sus resultados.", tipo:"Urgencia"},
  {kanji:"柔", paper:"El árbol rígido se rompe.", msg:"Tao Te Ching: 'El hombre rígido es discípulo de la muerte. El flexible es discípulo de la vida.' Tu sistema de trading debe adaptarse, no ser dogma.", tipo:"道 · Tao"},
  {kanji:"讽", paper:"Compraste el curso. El profe compró un auto.", msg:"Los que venden cursos de trading para vivir... viven de vender cursos. No de hacer trading. Busca a alguien que opere con capital real.", tipo:"Humor"},
  {kanji:"算", paper:"Una cuenta = $1,500/mes. Diez cuentas...", msg:"Haz la matemática. Con 10 cuentas activas operando el mismo sistema son $15,000 al mes. El trabajo es casi el mismo. El capital no.", tipo:"Dato Real"},
  {kanji:"开", paper:"El mercado abre mañana. ¿Tú también?", msg:"Mientras lees esto el oro se mueve. GC Comex no espera. La pregunta no es si el mercado tiene oportunidades — es si tú las estás tomando.", tipo:"Urgencia"},
  {kanji:"无", paper:"Actuar sin forzar.", msg:"Wu Wei — el principio Tao de no forzar: El mejor trade es el que el mercado te ofrece, no el que tú le exiges. Esperar es una estrategia.", tipo:"道 · Tao"},
  {kanji:"圈", paper:"Tu comunidad de trading te está frenando.", msg:"Si todos en tu grupo también están perdiendo, no es mala suerte. Es que están aprendiendo de las personas equivocadas.", tipo:"Urgencia"},
  {kanji:"实", paper:"Llevas 1 año en demo. Felicidades.", msg:"La cuenta demo no paga el alquiler. El mercado real se comporta diferente cuando tu dinero está en juego. Sal de la simulación.", tipo:"Verdad Incómoda"},
  {kanji:"金", paper:"El oro siempre ha sido dinero real.", msg:"GC Comex no es una moda. El oro ha sido reserva de valor por 5,000 años. Los que saben operarlo tienen una ventaja que no caduca.", tipo:"Dato Real"},
  {kanji:"时", paper:"Conocer el momento es todo.", msg:"Tao Te Ching: 'Hay un momento para avanzar y un momento para retroceder.' En trading, saber cuándo NO entrar vale más que saber cuándo entrar.", tipo:"道 · Tao"},
  {kanji:"险", paper:"No arriesgas tu dinero. Arriesgas el de ellos.", msg:"Con capital fondeado, las pérdidas las absorbe la firma. Las ganancias son tuyas. Es el único negocio donde el riesgo no es simétrico.", tipo:"Dato Real"},
  {kanji:"变", paper:"¿Cuántos meses más de pérdidas necesitas?", msg:"Cada mes que pasa sin un sistema probado es un mes de matrícula que le pagas al mercado. En algún momento hay que cambiar de maestro.", tipo:"Urgencia"},
  {kanji:"忍", paper:"La paciencia es la estrategia más rentable.", msg:"El Tao del trader: El río no corre — fluye. No hay prisa. Hay dirección. El trader que espera la entrada perfecta gana más que el que persigue el precio.", tipo:"道 · Tao"},
  {kanji:"控", paper:"Tu gestión de riesgo es tu seguro de vida.", msg:"Puedes tener la mejor estrategia del mundo. Sin gestión de riesgo no duras. Una sola mala operación sin SL borra semanas de trabajo.", tipo:"Dato Real"},
  {kanji:"读", paper:"El precio te da pistas. ¿Las estás leyendo?", msg:"GC Comex habla. El precio deja huellas. El problema no es el mercado — es que la mayoría no sabe escucharlo.", tipo:"Análisis"},
  {kanji:"周", paper:"Hay traders que retiran cada semana.", msg:"No es fantasía. Las prop firms pagan semanalmente. Yo lo hago. La pregunta es cuándo vas a empezar tú.", tipo:"Dato Real"},
  {kanji:"息", paper:"El descanso también es parte del sistema.", msg:"Tao Te Ching: 'El que sabe descansar tiene la ventaja.' El trader que opera cansado comete errores que no cometería fresco.", tipo:"道 · Tao"},
  {kanji:"应", paper:"No necesitas predecir. Necesitas reaccionar.", msg:"Los mejores traders no saben qué va a pasar. Saben qué hacer cuando pasa. Gestión de riesgo + disciplina = consistencia.", tipo:"Mentalidad"},
  {kanji:"我", paper:"Tu ego es tu peor enemy en el mercado.", msg:"El mercado no te odia ni te quiere. No tiene opinión sobre ti. Pero tu ego sí tiene opinión sobre el mercado — y eso cuesta dinero.", tipo:"Humor"},
  {kanji:"富", paper:"La riqueza llega al que tiene paciencia.", msg:"Proverbio chino: 'El que espera con paciencia obtiene lo que busca. El que corre solo encuentra cansancio.' Aplica perfectamente al trading.", tipo:"道 · Tao"},
  {kanji:"始", paper:"Empecé en agosto 2025 sin experiencia.", msg:"Sin experiencia en futuros. Con la mentalidad correcta. $18,000 en mi mejor mes. El mercado no pregunta tu historia — solo tus resultados.", tipo:"Historia Real"},
  {kanji:"析", paper:"¿Cuándo fue la última vez que analizaste un trade?", msg:"No el resultado — el proceso. ¿Por qué entraste? ¿Respetaste el plan? ¿Qué harías diferente? El trader que no aprende de sus trades no mejora.", tipo:"Reflexión"},
  {kanji:"债", paper:"El mercado no te debe nada.", msg:"No te debe recuperar tus pérdidas. No te debe el trade perfecto. Solo te ofrece oportunidades. Tú decides si estás preparado para tomarlas.", tipo:"Perspectiva"},
  {kanji:"计", paper:"Operas con miedo o con un plan.", msg:"El miedo toma decisiones en fracción de segundos. El plan las toma con calma antes de abrir el mercado. Solo uno es consistentemente rentable.", tipo:"Disciplina"},
  {kanji:"静", paper:"El silencio antes del trade es poder.", msg:"Tao Te Ching: 'El silencio es la fuente de la gran fuerza.' El trader que espera en silencio su setup es más peligroso que el que opera todo el día.", tipo:"道 · Tao"},
  {kanji:"决", paper:"Hay personas que ya tomaron la decisión.", msg:"Ahora mismo hay traders con cuentas fondeadas operando GC. No son más listos que tú. Solo tomaron la decisión antes.", tipo:"Urgencia"},
  {kanji:"行", paper:"Tu análisis no vale nada sin ejecución.", msg:"El mejor análisis técnico del mundo no gana dinero si no ejecutas. El mercado premia la acción disciplinada, no la teoría perfecta.", tipo:"Ejecución"},
  {kanji:"水", paper:"El agua encuentra su camino siempre.", msg:"Tao Te Ching: 'El agua supera los obstáculos sin esfuerzo.' El trader adaptable encuentra oportunidades en cualquier mercado.", tipo:"道 · Tao"},
  {kanji:"惰", paper:"¿Cuánto cuesta no hacer nada?", msg:"La inacción también tiene un precio. Cada mes que no construyes el sistema es un mes que otros sí lo están construyendo.", tipo:"Urgencia"},
  {kanji:"证", paper:"Las prop firms pagan. Yo tengo 4 certificados.", msg:"$1,147 + $1,200 + $1,352 + $1,610 en retiros verificados. Las prop firms son reales. Los resultados son reales.", tipo:"Prueba Real"},
  {kanji:"完", paper:"El perfeccionismo mata más trades que el mercado.", msg:"Esperar la entrada perfecta es otra forma de no actuar. El trader exitoso actúa con el 80% de la información. El perfeccionista sigue esperando.", tipo:"Humor"},
  {kanji:"备", paper:"La fortuna favorece al preparado.", msg:"Séneca: 'La suerte es lo que pasa cuando la preparación se encuentra con la oportunidad.' En trading: sistema + disciplina + gestión.", tipo:"Sabiduría"},
  {kanji:"假", paper:"Tu cuenta demo tiene 99% de winrate.", msg:"Felicidades. Ahora intenta eso con dinero real y emociones reales. El mercado demo y el real son dos universos diferentes.", tipo:"Humor"},
  {kanji:"系", paper:"Cada retiro es una validación del sistema.", msg:"No es suerte. Es un sistema replicable. Cuando el mismo proceso genera resultados consistentes, ya no es coincidencia — es maestría.", tipo:"Consistencia"},
  {kanji:"步", paper:"El camino de mil millas empieza con un paso.", msg:"Lao Tzu. En trading ese primer paso es abrir una evaluación de prop firm. No el curso número 5. No el indicador nuevo. La evaluación.", tipo:"道 · Tao"},
  {kanji:"习", paper:"¿Cuántas horas llevas estudiando sin operar?", msg:"El conocimiento sin práctica es entretenimiento. El mercado no paga por saber teoría. Paga por ejecutar correctamente bajo presión.", tipo:"Urgencia"},
  {kanji:"诚", paper:"El oro no miente.", msg:"GC Comex refleja el miedo y la codicia global. Quien aprende a leer esas emociones en el precio tiene una ventaja que ningún algoritmo puede quitarle.", tipo:"Mercado"},
  {kanji:"简", paper:"Lo simple funciona. Lo complejo impresiona.", msg:"El trader con 3 indicadores bien entendidos gana más que el que tiene 15. La simplicidad es maestría disfrazada.", tipo:"Mentalidad"},
  {kanji:"顺", paper:"El Tao del trader es la no-resistencia.", msg:"No pelees contra la tendencia. No pelees contra tu stop loss. No pelees contra el mercado. El que no resiste, fluye. El que fluye, gana.", tipo:"道 · Tao"},
  {kanji:"账", paper:"¿Tu cuenta bancaria refleja tus conocimientos?", msg:"Si llevas meses estudiando y tu cuenta sigue igual... el problema no es el conocimiento. Es la aplicación. Es el sistema.", tipo:"Urgencia"},
  {kanji:"级", paper:"Blue Row Capital no fondea a cualquiera.", msg:"Me promovieron a Live Trader oficial porque demostré consistencia. Las prop firms serias premian la disciplina. No el winrate de una semana.", tipo:"Credencial"},
  {kanji:"山", paper:"La montaña no se mueve para el escalador.", msg:"Proverbio chino: 'La montaña no viene a ti. Tú vas a la montaña.' El mercado no va a adaptarse a ti. Adáptate tú al mercado.", tipo:"道 · Tao"},
  {kanji:"提", paper:"¿Cuándo fue tu último retiro real?", msg:"Si no recuerdas cuándo fue... eso ya es la respuesta. El objetivo no es ganar trades. Es retirar dinero real de forma consistente.", tipo:"Urgencia"},
  {kanji:"管", paper:"La gestión de capital es tu superpoder.", msg:"Dos traders con la misma estrategia. Uno arriesga el 10% por trade. El otro el 1%. En 6 meses son universos diferentes.", tipo:"Gestión"},
  {kanji:"稳", paper:"El trader exitoso aburre.", msg:"Entra. Pone el SL. Pone el TP. Espera. Sale. Repite. No hay drama. No hay adrenalina. Solo proceso. Solo resultados.", tipo:"Humor"},
  {kanji:"阴", paper:"Sin oscuridad no hay luz.", msg:"Tao Te Ching: 'El ser y el no-ser se generan mutuamente.' Las pérdidas no son el enemigo del trader. Son el maestro.", tipo:"道 · Tao"},
  {kanji:"师", paper:"¿Cuántos gurús has seguido ya?", msg:"Si llevas 3 o más maestros de trading y sigues sin resultados... el problema no era el maestro anterior. Es el sistema. Es el enfoque.", tipo:"Urgencia"},
  {kanji:"链", paper:"El PAXG replica el oro en crypto.", msg:"PAX Gold es un token respaldado por oro físico. Mismo movimiento que GC Comex. Sin necesidad de futuros. Accesible desde cualquier exchange.", tipo:"Dato Técnico"},
  {kanji:"信", paper:"La confianza se construye con resultados.", msg:"No con posts de Instagram. No con screenshots de una semana buena. Con certificados verificados. Con retiros reales. Con consistencia.", tipo:"Credibilidad"},
  {kanji:"为", paper:"El camino correcto parece inactivo.", msg:"Tao Te Ching: 'El gran hacedor parece no hacer nada.' El trader disciplinado que espera su setup parece aburrido. Hasta que retira.", tipo:"道 · Tao"},
  {kanji:"建", paper:"¿Estás construyendo o consumiendo?", msg:"Ver videos de trading es consumir. Ejecutar un sistema real es construir. Solo uno de los dos te acerca al retiro del mes.", tipo:"Urgencia"},
  {kanji:"忘", paper:"El mercado tiene memoria corta.", msg:"Lo que pasó ayer no determina lo que pasa hoy. Cada sesión es nueva. El trader que llega con resentimiento del día anterior ya está en desventaja.", tipo:"Mentalidad"},
  {kanji:"薪", paper:"Tradeify paga cada semana.", msg:"No cada mes. Cada semana. Con mi código RAED tienes 30% de descuento para empezar. El sistema ya existe. Solo tienes que usarlo.", tipo:"Dato Real"},
  {kanji:"龟", paper:"La tortuga venció al conejo.", msg:"Esopo lo dijo hace 2,500 años. El trading consistente y lento acumula más que el trading agresivo y rápido. La tortuga tiene cuenta fondeada. El conejo está en drawdown.", tipo:"Humor"},
  {kanji:"够", paper:"¿Cuánto tiempo más le vas a regalar al mercado?", msg:"Cada pérdida sin aprendizaje es dinero regalado. Cada mes sin sistema es tiempo regalado. En algún momento hay que decidir que ya fue suficiente.", tipo:"Urgencia"},
  {kanji:"火", paper:"El fuego que no se controla lo quema todo.", msg:"Analogía Tao: La pasión sin disciplina en trading destruye cuentas. El fuego controlado calienta el hogar. La pasión controlada genera retiros.", tipo:"道 · Tao"},
  {kanji:"图", paper:"Nasdaq tiene patrones. GC también.", msg:"Los mercados de futuros no son aleatorios. Tienen estructura, contexto, niveles. El que aprende a leerlos tiene ventaja perpetua.", tipo:"Análisis"},
  {kanji:"境", paper:"Tu comunidad determina tu techo.", msg:"Si todos en tu círculo están perdiendo dinero en trading... rodearte de traders que retiran es el cambio más importante que puedes hacer.", tipo:"Urgencia"},
  {kanji:"月", paper:"El maestro verdadero señala la luna.", msg:"Proverbio Zen: 'El dedo que señala la luna no es la luna.' El buen mentor no te da el pez. Te enseña a pescar en GC Comex.", tipo:"道 · Tao"},
  {kanji:"拳", paper:"Perder un trade no es perder el sistema.", msg:"El boxeador campeón también recibe golpes. Lo que importa es cómo responde. Un trade perdido dentro del sistema es parte del proceso.", tipo:"Resiliencia"},
  {kanji:"钱", paper:"¿Cuándo vas a tomar en serio tu dinero?", msg:"El mercado sí se toma en serio tu dinero. Te lo quita con precisión quirúrgica si no tienes sistema. Llega el momento de ser igual de serio.", tipo:"Urgencia"},
  {kanji:"析", paper:"El exceso de análisis paraliza.", msg:"Analysis paralysis: El trader que espera tener toda la información nunca entra. Y el mercado sigue moviéndose sin él.", tipo:"Humor"},
  {kanji:"星", paper:"La oscuridad revela las estrellas.", msg:"Tao Te Ching: Solo en la oscuridad se ven las estrellas. El mercado bajista revela qué traders tienen sistema real y cuáles solo tuvieron suerte.", tipo:"道 · Tao"},
  {kanji:"实", paper:"My Funded Futures me pagó 4 veces en 5 semanas.", msg:"$1,147 — $1,200 — $1,352 — $1,610. Todo verificado. Todo en un mes. Las prop firms no son teoría.", tipo:"Prueba Verificada"},
  {kanji:"恒", paper:"El mercado premia la consistencia, no la suerte.", msg:"Una semana con 10x no significa nada si la siguiente pierdes todo. Retirar $1,500 cada mes durante 12 meses vale más que $18,000 en uno.", tipo:"Consistencia"},
  {kanji:"换", paper:"¿Por qué seguir perdiendo con los mismos?", msg:"La definición de insanidad es hacer lo mismo esperando resultados diferentes. Si tu método actual no genera retiros reales, es hora de cambiar.", tipo:"Urgencia"},
  {kanji:"怕", paper:"El origen de todos los miedos es la ignorancia.", msg:"Confucio: El miedo al mercado desaparece cuando entiendes el mercado. El miedo a las prop firms desaparece cuando las entiendes.", tipo:"道 · Tao"},
  {kanji:"扩", paper:"Escalar no es abrir más trades.", msg:"Escalar es abrir más cuentas fondeadas operando el mismo sistema. Mismo riesgo por cuenta. Capital multiplicado. Retiros multiplicados.", tipo:"Modelo"},
  {kanji:"强", paper:"El que domina a los demás es fuerte.", msg:"Lao Tzu: 'El que se domina a sí mismo es poderoso.' En trading, el que domina sus emociones ya venció al 90% del mercado.", tipo:"道 · Tao"},
  {kanji:"风", paper:"El riesgo no es el enemigo. La ignorancia sí.", msg:"Operar con capital fondeado y stop loss definido es más seguro que dejar dinero en el banco perdiendo valor. El riesgo gestionado es oportunidad.", tipo:"Perspectiva"},
  {kanji:"故", paper:"Cada señal tiene una historia detrás.", msg:"No es una flecha en un gráfico. Es contexto macro, nivel clave, momentum y gestión. El que entiende la historia detrás de la señal gana más.", tipo:"Análisis"},
  {kanji:"竹", paper:"El bambú dobla. El roble se rompe.", msg:"Sabiduría Tao: En mercados volátiles, la rigidez mata cuentas. La flexibilidad del bambú — que dobla sin romperse — es la mentalidad del trader élite.", tipo:"道 · Tao"},
  {kanji:"问", paper:"Llevas perdiendo con quien nunca ganó.", msg:"Hay una diferencia enorme entre alguien que habla de trading y alguien que tiene certificados verificados de prop firms reales.", tipo:"Urgencia"},
  {kanji:"古", paper:"El oro lleva 5,000 años siendo valor.", msg:"Bitcoin tiene 15 años. Las acciones tienen 200. El oro tiene 5,000. Operar GC Comex es operar el activo más antiguo y más respetado del mundo.", tipo:"Historia"},
  {kanji:"梦", paper:"¿Qué harías con $5,000 extra este mes?", msg:"No es una pregunta retórica. Es lo que genera una sola cuenta fondeada bien operada. La pregunta real es: ¿qué te está frenando?", tipo:"Visualización"},
  {kanji:"徒", paper:"El maestro fue primero alumno.", msg:"Confucio: 'No importa cuán lento vayas, siempre y cuando no te detengas.' Cada trader exitoso pasó por la frustración que sientes hoy.", tipo:"道 · Tao"},
  {kanji:"情", paper:"Las emociones son información. No órdenes.", msg:"El miedo te avisa de riesgo real. La euforia te avisa de sobreexposición. El trader inteligente escucha las emociones pero ejecuta según el plan.", tipo:"Inteligencia Emocional"},
  {kanji:"习", paper:"Un mal trade no define tu carrera.", msg:"Pero un mal hábito sí. Operar sin SL una vez es un error. Operar sin SL siempre es un sistema de perder. La diferencia está en si aprendes.", tipo:"Hábitos"},
  {kanji:"滴", paper:"El universo recompensa la acción consistente.", msg:"Principio Tao: La gota de agua que cae constantemente horada la piedra. No por su fuerza — por su consistencia. Así funciona el trading rentable.", tipo:"道 · Tao"},
  {kanji:"备", paper:"¿Tienes plan B si el mercado te sorprende?", msg:"El mercado sorprende siempre. El trader con plan B no se sorprende. Solo ejecuta el plan alternativo. Eso es gestión de riesgo real.", tipo:"Preparación"},
  {kanji:"渡", paper:"El que no arriesga no cruza el río.", msg:"Proverbio chino: Pero el que cruza sin preparación se ahoga. El prop trading te da el bote — la preparación, el remo. Solo tienes que aprender a usarlos.", tipo:"道 · Tao"},
  {kanji:"自", paper:"$15,000 al mes. Desde cualquier lugar.", msg:"No es un sueño. Es mi realidad desde agosto 2025. Con capital fondeado, disciplina y el sistema correcto. El lugar geográfico es irrelevante.", tipo:"Libertad"},
  {kanji:"学", paper:"El mercado es el mejor maestro. Y el más caro.", msg:"Aprende de alguien que ya pagó la matrícula. O págala tú. La diferencia es cuánto tiempo y dinero estás dispuesto a invertir en errores propios.", tipo:"Urgencia"},
  {kanji:"毅", paper:"La victoria pertenece al más perseverante.", msg:"Napoleón Bonaparte. No al más inteligente. No al que tiene mejor indicador. Al que no se rinde cuando el mercado lo prueba.", tipo:"Sabiduría"},
  {kanji:"双", paper:"GC Comex y XAUUSD. El mismo oro. Dos mundos.", msg:"GC es futuros — más apalancamiento, más estructura. XAUUSD es spot — más accesible. Dominar ambos da flexibilidad que pocos traders tienen.", tipo:"Técnico"},
  {kanji:"树", paper:"El mejor momento para plantar un árbol fue hace 20 años.", msg:"Proverbio chino: El segundo mejor momento es ahora. No el lunes. No cuando termines el curso. Ahora.", tipo:"道 · Tao"},
  {kanji:"家", paper:"¿Tu familia sabe lo que estás construyendo?", msg:"El prop trading no es apuesta. Es un modelo de negocio verificable con certificados, retiros y reglas claras. Merece ser tomado en serio.", tipo:"Perspectiva"},
  {kanji:"考", paper:"El drawdown no es el fin. Es el examen.", msg:"Todo trader pasa por drawdowns. El profesional reduce tamaño. El amateur dobla la apuesta. La diferencia define quién dura.", tipo:"Gestión"},
  {kanji:"记", paper:"Lo que no se mide no mejora.", msg:"Lleva un diario de trading. Cada entrada, cada salida, cada emoción. El trader que no mide su desempeño repite sus errores con más confianza cada vez.", tipo:"Disciplina"}
];

function getGalletaDelDia() {
  var day = new Date().getDay() + new Date().getDate() + new Date().getMonth();
  var idx = day % galletaMsgs.length;
  return galletaMsgs[idx];
}

function emailWrapper(content) {
  return '<div style="max-width:600px;margin:0 auto;background:#0D0D10;font-family:Arial,sans-serif;color:#F0EBE0">' +
    '<div style="background:#060608;padding:24px 32px;text-align:center;border-bottom:2px solid #C8A84B;display:flex;align-items:center;justify-content:center;gap:16px">' +
    '<img src="https://the1percentformula.com/logo.png" alt="The 1% Trading Formula" style="width:52px;height:52px;object-fit:contain">' +
    '<div style="text-align:left">' +
    '<h1 style="font-size:1.1rem;font-weight:700;color:#C8A84B;margin:0">The 1% Trading Formula</h1>' +
    '<p style="font-size:.7rem;color:#666;margin:2px 0 0">@raedtrades_</p>' +
    '</div>' +
    '</div>' +
    '<div style="padding:36px 32px">' + content + '</div>' +
    '<div style="padding:20px 32px;border-top:1px solid #222;text-align:center">' +
    '<a href="https://the1percentformula.com" style="color:#C8A84B;font-size:.72rem;text-decoration:none">the1percentformula.com</a>' +
    '<p style="font-size:.65rem;color:#333;margin-top:8px">Trading implica riesgo · No es asesoramiento financiero</p>' +
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
  var content = '<img src="https://the1percentformula.com/og-image.jpg" alt="The 1% Trading Formula" style="width:100%;display:block;margin-bottom:28px;border:1px solid #C8A84B22">' +
    '<h2 style="font-size:1.6rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Bienvenido ' + (name || '') + ' 🐂</h2>' +
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
  var content = '<img src="https://the1percentformula.com/cert4.png" alt="Payout Certificate $1,610" style="width:100%;display:block;margin-bottom:24px;border:1px solid #C8A84B44">' +
    '<h2 style="font-size:1.5rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Hola ' + (name || '') + ', recuerda esto 👇</h2>' +
    '<p style="color:#888;line-height:1.7;margin-bottom:24px">Con el codigo <strong style="color:#C8A84B">RAED</strong> tienes <strong style="color:#22c55e">30% de descuento</strong> en Tradeify — la prop firm que yo uso para operar GC y Nasdaq en vivo.</p>' +
    '<div style="background:#111;border-left:3px solid #C8A84B;padding:20px 24px;margin-bottom:24px">' +
    '<p style="font-size:.88rem;color:#999;line-height:1.7">Tradeify me da acceso a cuentas de hasta $200K para operar futuros. Sus evaluaciones son rapidas y los payouts llegan semanalmente. Es la firma con la que trabajo activamente.</p>' +
    '</div>' +
    refLink('Tradeify', 'https://tradeify.co/?ref=BTER2VJV', 'RAED', '30% de descuento', 'Codigo valido para cualquier cuenta. No lo dejes pasar.', 'Aplicar descuento ahora');
  await sendEmail(email, '🔥 Codigo RAED — 30% OFF en Tradeify (recuerdalo)', emailWrapper(content));
}

// Email 3 (dia 4): Recordatorio Bitget + PAXG
async function sendBitgetReminder(name, email) {
  var content = '<img src="https://the1percentformula.com/raed-f1.jpg" alt="Raed en F1 Miami" style="width:100%;height:200px;object-fit:cover;object-position:top;display:block;margin-bottom:24px;border:1px solid #C8A84B22">' +
    '<h2 style="font-size:1.5rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Copia mis trades en Bitget 📈</h2>' +
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
  var content = '<img src="https://the1percentformula.com/raed-sea.jpg" alt="Raed operando desde el Mediterraneo" style="width:100%;height:200px;object-fit:cover;object-position:top;display:block;margin-bottom:24px;border:1px solid #C8A84B22">' +
    '<h2 style="font-size:1.5rem;font-weight:700;color:#F0EBE0;margin-bottom:8px">Una semana en la comunidad 🐂</h2>' +
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
