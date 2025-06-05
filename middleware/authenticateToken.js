const jwt = require('jsonwebtoken');
const { pool } = require('../config/dbConfig'); 

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }


  if (token === process.env.ALERT_INTERNAL_TOKEN) {
    req.user = { id: 'internal', email: 'internal@aircheck.local' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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


