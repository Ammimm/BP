const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/dbConfig');
const { checkNotAuthenticated } = require('../middleware/authChecks');

router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const tokenResult = await pool.query(
      'SELECT token FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );

    if (tokenResult.rows.length > 0) {
      return res.json({ accessToken: tokenResult.rows[0].token });
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
    );

    await pool.query(
      'INSERT INTO api_tokens (user_id, token) VALUES ($1, $2)',
      [user.id, accessToken]
    );

    res.json({ accessToken });

  } catch (err) {
    console.error('API login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/users/api-token', checkNotAuthenticated, async (req, res) => {
  const result = await pool.query(
    'SELECT token FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return res.status(500).send('Token nebol nájdený.');
  }

  const token = result.rows[0].token;
  res.render('api-token', { token });
});



router.post('/users/api-token/refresh', checkNotAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    await pool.query('DELETE FROM api_tokens WHERE user_id = $1', [userId]);

    const newToken = jwt.sign(
      { id: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
    );

    await pool.query(
      'INSERT INTO api_tokens (user_id, token) VALUES ($1, $2)',
      [userId, newToken]
    );

    res.json({ token: newToken });
  } catch (err) {
    console.error('Token refresh error:', err.message);
    res.status(500).json({ error: 'Chyba pri generovaní nového tokenu' });
  }
});

module.exports = router;