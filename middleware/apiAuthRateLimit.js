
/*
const rateLimit = require('express-rate-limit');
const { pool } = require('../dbConfig');

const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hodina
  max: 100, // max. 100 požiadaviek za hodinu
  keyGenerator: (req) => req.apiKey || req.ip, // identifikátor klienta
  message: '⏱️ Príliš veľa požiadaviek – skúste neskôr',
  standardHeaders: true,
  legacyHeaders: false,
});

const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('ApiKey ')) {
    return res.status(401).json({ error: 'Chýba API kľúč (Authorization: ApiKey <tvoj_kľúč>)' });
  }

  const apiKey = authHeader.replace('ApiKey ', '');
  try {
    const result = await pool.query('SELECT * FROM users WHERE api_key = $1', [apiKey]);
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Neplatný API kľúč' });
    }

    req.apiKey = apiKey;
    req.apiUser = result.rows[0]; // môžeš si ho preposlať do ďalšieho middleware alebo logovať
    next();
  } catch (err) {
    console.error('❌ DB chyba pri overení API kľúča:', err);
    res.status(500).json({ error: 'Interná chyba servera' });
  }
};

// Spojený middleware: najprv autentifikácia, potom rate limit
const apiAuthRateLimit = [authenticateApiKey, apiKeyRateLimit];

module.exports = apiAuthRateLimit;
*/

//NOVE 
const rateLimit = require('express-rate-limit');
const { pool } = require('../dbConfig');

const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hodina
  max: 100,
  keyGenerator: (req) => req.apiKey || req.ip,
  message: '⏱️ Príliš veľa požiadaviek – skúste neskôr',
  standardHeaders: true,
  legacyHeaders: false,
});

const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('ApiKey ')) {
    return res.status(401).json({ error: 'Chýba API kľúč' });
  }

  const apiKey = authHeader.replace('ApiKey ', '');
  try {
    const result = await pool.query(
      'SELECT * FROM api_keys WHERE key = $1 AND is_active = true',
      [apiKey]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Neplatný alebo neaktívny API kľúč' });
    }

    req.apiKey = apiKey;
    req.apiUserId = result.rows[0].user_id;
    next();
  } catch (err) {
    console.error('Chyba pri overovaní API kľúča:', err);
    res.status(500).json({ error: 'Interná chyba servera' });
  }
};

const apiAuthRateLimit = [authenticateApiKey, apiKeyRateLimit];

module.exports = apiAuthRateLimit;
