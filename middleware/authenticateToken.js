
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']; // hlavička Authorization
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer token" -> ["Bearer", "token"]

    if (!token) {
        return res.status(401).json({ error: 'Access token missing' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verify error:', err.message);
            return res.status(403).json({ error: 'Invalid or expired access token' });
        }

        req.user = user; // ak je všetko OK, uložíme si usera do requestu
        next();
    });
}

module.exports = authenticateToken;

