require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// DB pripojenie
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Email odosielateľ (napr. Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});

// Cron úloha každú hodinu
cron.schedule('0 * * * *', async () => {
  console.log(`[${new Date().toISOString()}]  Spúšťam kontrolu upozornení na kvalitu ovzdušia...`);

  try {
    const alerts = await pool.query(`
      SELECT f.id, f.location_id, u.email
      FROM favorites f
      JOIN users u ON f.user_id = u.id
      WHERE f.alerts_enabled = true
    `);

    for (const row of alerts.rows) {
      const locationId = row.location_id;
      const userEmail = row.email;

      try {
        const response = await axios.get(`${process.env.SERVER_URL}/airquality?id=${locationId}`, {
          headers: {
            Authorization: `Bearer ${process.env.ALERT_INTERNAL_TOKEN}`
          }
        });

        const data = response.data;
        if (data.aqi && data.aqi > 100) {
          await transporter.sendMail({
            from: `"AIR CHECK" <${process.env.ALERT_EMAIL_USER}>`,
            to: userEmail,
            subject: ` Zhoršená kvalita ovzdušia – ${data.city}`,
            html: `
              <p>AQI v lokalite <strong>${data.city}</strong> je <strong>${data.aqi}</strong>.</p>
              <p>Dominantný znečisťujúci prvok: ${data.dominantPollutant || 'neznámy'}.</p>
              <p><a href="${process.env.SERVER_URL}/users/dashboard">Otvoriť dashboard</a></p>
            `
          });

          console.log(`📧 Upozornenie odoslané na ${userEmail}`);
        } else {
          console.log(`ℹ️ AQI ${data.aqi} pre ${data.city} – bez upozornenia`);
        }
      } catch (err) {
        console.warn(` Chyba pri AQI pre ID ${locationId}:`, err.message);
      }
    }
  } catch (err) {
    console.error(' Chyba pri spracovaní DB:', err.message);
  }
});
