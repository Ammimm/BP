require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { pool } = require('../config/dbConfig'); 

module.exports = function startAirQualityCron() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL_USER,
      pass: process.env.ALERT_EMAIL_PASS
    }
  });

  cron.schedule('0 * * * *', async () => { //every hour
    console.log(`[${new Date().toISOString()}] Spúšťam kontrolu upozornení...`);

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
            const { level, message } = getAqiInfo(data.aqi);
            await transporter.sendMail({
              from: `"AIR CHECK" <${process.env.ALERT_EMAIL_USER}>`,
              to: userEmail,
              subject: `Zhoršená kvalita ovzdušia – ${data.city}`,
              html: `
                <p>AQI v lokalite <strong>${data.city}</strong> je <strong>${data.aqi}</strong> (${level}).</p>
                <p>${message}</p>
                <p><a href="${process.env.SERVER_URL}/users/dashboard">viac na stránke</a></p>
              `
            });

            console.log(`📧 E-mail odoslaný na ${userEmail}`);
          } else {
            console.log(`ℹ️ AQI ${data.aqi} – žiadne upozornenie`);
          }
        } catch (err) {
          console.warn(`Chyba pri AQI pre ${locationId}:`, err.message);
        }
        await delay(1000);
      }
    } catch (err) {
      console.error('Chyba pri dotaze do DB:', err.message);
    }
  });
};


function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function getAqiInfo(aqi) {
  if (aqi <= 150) {
    return {
      level: 'Nezdravá pre citlivé skupiny',
      message: 'Starší ľudia a osoby s dýchacími ťažkosťami by sa mali vyhnúť námahe vonku.'
    };
  } else if (aqi <= 200) {
    return {
      level: 'Nezdravá',
      message: 'Vyhýbajte sa vonkajšej námahe. Zostaňte, ak je to možné, vo vnútri.'
    };
  } else if (aqi <= 300) {
    return {
      level: 'Veľmi nezdravá',
      message: 'Zostaňte doma. Nepretrvávajte vonku. Citlivé osoby by mali byť obzvlášť opatrné.'
    };
  } else {
    return {
      level: 'Nebezpečná',
      message: 'Výrazne znečistený vzduch. Zdržiavajte sa výlučne vo vnútri. Sledujte pokyny úradov.'
    };
  }
}
