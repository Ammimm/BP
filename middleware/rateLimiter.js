const userLastRequestTime = new Map(); // userId => timestamp poslednej požiadavky

function rateLimiter(req, res, next) {
  const userId = req.user.id;
  const now = Date.now();

  const lastRequest = userLastRequestTime.get(userId);

  if (lastRequest && now - lastRequest < 1000) {
    return res.status(429).json({ error: 'Príliš veľa požiadaviek. Max. 1 za sekundu.' });
  }

  userLastRequestTime.set(userId, now);
  next();
}

module.exports = rateLimiter;
