require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});

transporter.sendMail({
  from: `"AIR CHECK" <${process.env.ALERT_EMAIL_USER}>`,
  to: 'stefinovam@gmail.com',
  subject: 'Test e-mail z aplikácie',
  text: 'Toto je testovací e-mail zo systému AIR CHECK.',
html: '<p>Toto je <strong>testovací e-mail</strong> zo systému AIR CHECK.</p>'

}, (err, info) => {
  if (err) {
    console.error('❌ Nepodarilo sa odoslať e-mail:', err.message);
  } else {
    console.log('✅ E-mail bol úspešne odoslaný:', info.response);
  }
});
