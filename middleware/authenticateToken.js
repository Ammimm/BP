const jwt = require('jsonwebtoken');
const { pool } = require('../dbConfig'); // db pripojenie

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Skontroluj, či token je v databáze
    const result = await pool.query(
      'SELECT * FROM api_tokens WHERE user_id = $1 AND token = $2',
      [decoded.id, token]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Token not found in database or revoked' });
    }

    req.user = decoded;
    next();

  } catch (err) {
    console.error('Token verification error:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authenticateToken;


