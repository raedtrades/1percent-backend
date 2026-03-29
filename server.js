require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const invoiceStore = {};
const subscribers = [];

const NP_API = 'https://api.nowpayments.io/v1';
const NP_HEADERS = {
  'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
  'Content-Type': 'application/json'
};

async function sendEmail(to, subject, html) {
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Raed — The1Percent <raed@the1percentformula.com>',,
      to: to,
      subject: subject,
      html: html
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Email sent to:', to);
  } catch (err) {
    console.error('Email error:', err.response?.data || err.message);
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'The1Percent Backend online' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
