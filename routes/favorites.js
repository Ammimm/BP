const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../config/dbConfig');
const authenticateToken = require('../middleware/authenticateToken');

const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});


router.post('/favorites', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { locationId } = req.body;

  if (!locationId) {
    return res.status(400).json({ error: 'locationId is required' });
  }

  try {
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
      [userId]
    );

    const favoritesCount = parseInt(countResult.rows[0].count, 10);
    if (favoritesCount >= 5) {
      return res.status(400).json({ error: 'Maximálny počet obľúbených lokalít je 5.' });
    }


    const existsResult = await pool.query(
      'SELECT 1 FROM favorites WHERE user_id = $1 AND location_id = $2',
      [userId, locationId]
    );

    if (existsResult.rows.length > 0) {
      return res.status(400).json({ error: 'Táto lokalita je už medzi obľúbenými.' });
    }

    await pool.query(
      'INSERT INTO favorites (user_id, location_id) VALUES ($1, $2)',
      [userId, locationId]
    );

    res.json({ message: 'Lokalita pridaná medzi obľúbené.' });

  } catch (err) {
    console.error('Chyba pri ukladaní obľúbenej lokality:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});



router.get('/favorites', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
      const result = await pool.query(
          'SELECT * FROM favorites WHERE user_id = $1',
          [userId]
      );
      res.json(result.rows);
  } catch (err) {
      console.error('Chyba pri načítavaní obľúbených lokalít:', err.message);
      res.status(500).json({ error: 'Server error' });
  }
});


router.delete('/favorites/:id', authenticateToken, async (req, res) => {
  const favoriteId = req.params.id;
  const userId = req.user.id;

  try {
      await pool.query(
          'DELETE FROM favorites WHERE id = $1 AND user_id = $2',
          [favoriteId, userId]
      );
      res.json({ message: 'Lokalita odstránená z obľúbených.' });
  } catch (err) {
      console.error('Chyba pri mazání obľúbenej lokality:', err.message);
      res.status(500).json({ error: 'Server error' });
  }
});


router.post('/favorites/alert-now', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { locationId } = req.body;

  if (!locationId) {
    return res.status(400).json({ error: 'Chýba locationId.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM favorites WHERE user_id = $1 AND location_id = $2',
      [userId, locationId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Táto lokalita nie je medzi tvojimi obľúbenými.' });
    }

    const response = await axios.get(`${process.env.SERVER_URL}/airquality?id=${locationId}`, {
      headers: {
        Authorization: `Bearer ${process.env.ALERT_INTERNAL_TOKEN}` //special token
      }
    });

    const data = response.data;

    await transporter.sendMail({
      from: `"AIR CHECK" <${process.env.ALERT_EMAIL_USER}>`,
      to: req.user.email,
      subject: `📬 Dáta o kvalite ovzdušia – ${data.city}`,
      html: `
        <p>Aktuálne údaje z lokality <strong>${data.city}</strong>:</p>
        <ul>
          <li>AQI: ${data.aqi}</li>
          <li>Dominantný prvok: ${data.dominantPollutant || 'neznámy'}</li>
        </ul>
         <p><strong>Detailné merania:</strong></p>
        <ul>
         ${
            Object.entries(data.measurements || {})
             .map(([key, value]) => `<li>${key}: ${value}</li>`)
             .join('')
         }
         </ul>
        <p><a href="${process.env.SERVER_URL}/users/dashboard">Zobraziť v aplikácii</a></p>
      `
    }); 

    res.json({ message: 'E-mail odoslaný.' });

  } catch (err) {
    console.error('Chyba pri odoslaní e-mailu:', err.message);
    res.status(500).json({ error: 'Nepodarilo sa odoslať e-mail.' });
  }
});

router.patch('/favorites/:id/alert', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const favoriteId = req.params.id;
  const { enabled } = req.body;

  try {
    await pool.query(
      'UPDATE favorites SET alerts_enabled = $1 WHERE id = $2 AND user_id = $3',
      [enabled, favoriteId, userId]
    );
    res.json({ message: 'Stav upozornenia bol aktualizovaný.' });
  } catch (err) {
    console.error('Chyba pri aktualizácii upozornenia:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

