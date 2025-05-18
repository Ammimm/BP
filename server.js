require('dotenv').config(); //citlive udaje ..pridanie env
const express = require('express');
const app = express();
const { pool } = require ("./dbConfig"); //na dattabazu v pool je pripojenie a v env su prihlaosvacie udaje
const bcrypt = require('bcrypt'); // na hashovanie hesla
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const axios = require('axios'); //na odosielanie HTTP požiadaviek
const fs = require('fs'); // na nacitanie CSV
const csv = require('csv-parser'); 

const rateLimiter = require('./middleware/rateLimiter'); //limitovanie požiadaviek
//upozornenia
const startAirQualityCron = require('./alertWorker');
startAirQualityCron(); // <- spustenie pri štarte servera


app.use(express.json()); // na spravne posielanie post 

//na tokeny
const jwt = require('jsonwebtoken'); 
const authenticateToken = require('./middleware/authenticateToken');


app.use(express.static('public'));//na staticke subory co su v public (obrazky,script,css)




const initializePassport = require ("./passportConfig");

initializePassport(passport);

const AQICN_API_KEY = process.env.AQICN_API_KEY;
const AQ_API_KEY= process.env.AQ_API_KEY;



const PORT = process.env.PORT || 4000;



//NA TEST EMAILU 
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});



app.set ('view engine', 'ejs'); //sablonovy engine

//MIDDLEWARE
app.use(express.urlencoded({extended: false})); //Middleware  umožňuje, aby Express spracoval formulárové dáta

app.use(
    session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
    })
); 

app.use(passport.initialize());  
app.use(passport.session());

app.use(flash()); 

//Pomocná funkcia na kontrolu aktualnosti
function isDataRecent(timestamp) {
    const now = new Date();
    const ts = new Date(timestamp);
    const diffMinutes = (now - ts) / (1000 * 60);
    return diffMinutes < 60;
  }

const matchedLocations = {};
const matchedCSVPath = 'data/results/matched_locations.csv';

fs.createReadStream(matchedCSVPath)
  .pipe(csv({ separator: ';' }))
  .on('data', (row) => {
    const id = row.id;
    const queryName = row.query_name?.toLowerCase();
    matchedLocations[id] = row;
    if (queryName) matchedLocations[queryName] = row; 
  })
  .on('end', () => {
    console.log(`matched_locations.csv načítané. Záznamov: ${Object.keys(matchedLocations).length}`);
  });


// API endpoint na získanie zoznamu miest (aj pre frontend )
app.get('/locations',authenticateToken, (req, res) => {
  const locationsList = Object.values(matchedLocations)
    .filter((row, index, self) =>
      // vyfiltrujeme len unikátne podľa ID 
      index === self.findIndex(r => r.id === row.id)
    )
    .map(row => ({
      id: row.id,
      name: row.query_name || row.location_from_coords || row.location_name || 'Neznáma lokalita'
    }));

  res.json(locationsList);
});




// funkcia na vypocet AQI --dat neskor zvlast
function calculateAQI(concentration, breakpoints) {
    for (let i = 0; i < breakpoints.length - 1; i++) {
        const [cLow, cHigh, iLow, iHigh] = breakpoints[i];

        if (concentration >= cLow && concentration <= cHigh) {
            return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow);
        }
    }
    return 500; // hodnota mimo rozsahu => max AQI
}

//intervaly pre pm25 pm 10
const pm25_breakpoints = [
    [0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 500.4, 301, 500]
];

const pm10_breakpoints = [
    [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
    [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]
];

//hlavny
app.get('/airquality', authenticateToken,rateLimiter, async (req, res) => {
//app.get('/airquality', async (req, res) => {
    const id = req.query.id;
    const rawQueryName = req.query.query_name;
    const queryName = req.query.query_name?.toLowerCase();
  
    if (!id && !queryName) {
      return res.status(400).json({ error: 'Zadaj buď ?id alebo ?query_name' });
    }
  
    const record = matchedLocations[id] || matchedLocations[queryName]|| matchedLocations[rawQueryName];
    if (!record) {
      return res.status(404).json({ error: 'Lokalita nebola nájdená' });
    }
  
    const city = record.query_name || record.location_from_coords || record.location_name || 'Unknown';
  
    //  Najprv  údaje z DB 
    try {
      const dbResult = await pool.query(
        `SELECT * FROM air_quality WHERE city = $1`,
        [city]
      );
  
      if (dbResult.rows.length > 0) {
        const dbRow = dbResult.rows[0];
        if (dbRow.datatimestamp && isDataRecent(dbRow.datatimestamp)) {
          return res.json(dbRow); //  vrátime z DB
        }
      }
    } catch (err) {
      console.error(' DB chyba:', err.message);
      return res.status(500).json({ error: 'DB chyba' });
    }
  
    //  WAQI – ak máme uid_prefixed
    if (record.uid_prefixed) {
      try {
        const waqiUrl = `https://api.waqi.info/feed/${record.uid_prefixed}/?token=${AQICN_API_KEY}`;
        const response = await axios.get(waqiUrl);
        const data = response.data.data;
  
        const aqi = data.aqi ?? null;
        const dominantPollutant = data.dominentpol ?? null;
        const datatimestamp = data.time?.iso ?? null;
  
        const measurements = Object.fromEntries(
          Object.entries(data.iaqi || {}).map(([k, v]) => [k, v.v])
        );
  
        await pool.query(
          `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements, source, datatimestamp, timestamp)
           VALUES ($1, $2, $3, $4, 'WAQI', $5, CURRENT_TIMESTAMP)
           ON CONFLICT (city)
           DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant,
                         measurements = EXCLUDED.measurements, source = 'WAQI',
                         datatimestamp = EXCLUDED.datatimestamp, timestamp = CURRENT_TIMESTAMP`,
          [city, aqi, dominantPollutant, JSON.stringify(measurements), datatimestamp]
        );
  
        return res.json({ city, aqi, dominantPollutant, measurements, datatimestamp, source: 'WAQI' });
  
      } catch (error) {
        console.error('WAQI chyba:', error.message);
        return res.status(500).json({ error: 'WAQI chyba' });
      }
    }
  
    //OpenAQ 
    if (record.sensor_ids) {
      const sensorIds = record.sensor_ids.split(',').map(s => s.trim());
      const measurements = {};
      let datatimestamp = null;
  
      for (const sensorId of sensorIds) {
        try {
          const response = await axios.get(`https://api.openaq.org/v3/sensors/${sensorId}`, {
            headers: { 'X-API-Key': AQ_API_KEY }
          });
          const sensor = response.data.results[0];
          if (sensor?.latest) {
            measurements[sensor.parameter.name] = sensor.latest.value;
  
            const ts = sensor.latest.datetime?.local;
            if (ts && (!datatimestamp || new Date(ts) > new Date(datatimestamp))) {
              datatimestamp = ts;
            }
          }
        } catch (error) {
          console.warn(`Senzor ${sensorId} chyba:`, error.message);
        }
      }
  
      if (Object.keys(measurements).length === 0) {
        return res.status(404).json({ error: 'Žiadne dáta zo senzorov' });
      }
  
      const pm25 = measurements.pm25 ?? null;
      const pm10 = measurements.pm10 ?? null;
      const aqi_pm25 = pm25 !== null ? calculateAQI(pm25, pm25_breakpoints) : null;
      const aqi_pm10 = pm10 !== null ? calculateAQI(pm10, pm10_breakpoints) : null;
      const aqi = Math.max(aqi_pm25 ?? 0, aqi_pm10 ?? 0) || null;
  
      const dominantPollutant = Object.keys(measurements).reduce((a, b) =>
        measurements[a] > measurements[b] ? a : b
      );
  
      await pool.query(
        `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements, source, datatimestamp, timestamp)
         VALUES ($1, $2, $3, $4, 'openAQ', $5, CURRENT_TIMESTAMP)
         ON CONFLICT (city)
         DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant,
                       measurements = EXCLUDED.measurements, source = 'openAQ',
                       datatimestamp = EXCLUDED.datatimestamp, timestamp = CURRENT_TIMESTAMP`,
        [city, aqi, dominantPollutant, JSON.stringify(measurements), datatimestamp]
      );
  
      return res.json({ city, aqi, dominantPollutant, measurements, datatimestamp, source: 'openAQ' });
    }
  
    res.status(404).json({ error: 'Neboli nájdené žiadne dáta pre túto lokalitu' });
  });
  




app.get('/', (req, res) => {
    res.render("index"); 
})

app.get('/users/register',checkAuthenticated, (req, res) => {
    res.render("register"); 
})

app.get('/users/login',checkAuthenticated ,(req, res) => {
    res.render("login"); 
})

app.get('/users/dashboard', checkNotAuthenticated, (req, res) => {
  res.render("dashboard", { user: req.user.name });
});


app.get('/users/logout', (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err); // Ak sa vyskytne chyba, posunie ju na middleware
        }
        req.flash('success_msg', "Boli ste odhlásený");
        res.redirect("/users/login");
    });
});


app.post('/users/register', async (req, res) => {
  let { name, email, password, password2 } = req.body;
  let errors = [];

  if (!name || !email || !password || !password2) {
    errors.push({ message: "Please fill in all fields" });
  }

  if (password.length < 6) {
    errors.push({ message: "Password must be at least 6 characters long" });
  }

  if (password !== password2) {
    errors.push({ message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    return res.render("register", { errors });
  }

  try {
    const existingUser = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      errors.push({ message: "Email already registered" });
      return res.render("register", { errors });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)`,
      [name, email, hashedPassword]
    );

    req.flash("success_msg", "You are registered and can now log in");
    res.redirect("/users/login");

  } catch (err) {
    console.error("Chyba pri registrácii:", err.message);
    errors.push({ message: "Something went wrong. Please try again." });
    res.render("register", { errors });
  }
});



app.post('/users/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect('/users/login');

    req.logIn(user, async (err) => {
      if (err) return next(err);

      // Overenie, či už má token
      const result = await pool.query(
        'SELECT token FROM api_tokens WHERE user_id = $1 LIMIT 1',
        [user.id]
      );

      if (result.rows.length === 0) {
        // Vytvorenie nového tokenu a uloženie
        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.JWT_SECRET,
          //{ expiresIn: '30m' }
        );

        await pool.query(
          'INSERT INTO api_tokens (user_id, token) VALUES ($1, $2)',
          [user.id, token]
        );
      }

      return res.redirect('/users/api-token');

    });
  })(req, res, next);
});


/*
app.post('/users/login', passport.authenticate ('local',{
    successRedirect: '/users/dashboard',
    failureRedirect: '/users/login',
    failureFlash: true
})
);
*/

function checkAuthenticated (req, res, next)
{
    if(req.isAuthenticated()){
        return res.redirect("/users/dashboard");
    }
    next();

}
app.get('/users/favorites', checkNotAuthenticated, (req, res) => {
  res.render('favorites');
});


function checkNotAuthenticated (req, res, next){
    if(req.isAuthenticated()){
        return next();
    }
    res.redirect("/users/login");
}



app.listen(PORT,()=> {
    console.log(`Server is running on port ${PORT}`);
});



//na vytvorenie tokenu ked pouzivatel nechce ist cez stranku 
app.post('/api/login', async (req, res) => {
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

    // Skús získať existujúci token
    const tokenResult = await pool.query(
      'SELECT token FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );

    if (tokenResult.rows.length > 0) {
      return res.json({ accessToken: tokenResult.rows[0].token });
    }

    // Ak token neexistuje → vytvor nový
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      //{ expiresIn: '15m' }
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





app.get('/users/api-token', checkNotAuthenticated, async (req, res) => {
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





//REFRESH TOKEN 
app.post('/users/api-token/refresh', checkNotAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    // Zmaž všetky staré tokeny
    await pool.query('DELETE FROM api_tokens WHERE user_id = $1', [userId]);

    // Vytvor nový token
    const newToken = jwt.sign(
      { id: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      //{ expiresIn: '30m' }
    );

    // Ulož do DB
    await pool.query(
      'INSERT INTO api_tokens (user_id, token) VALUES ($1, $2)',
      [userId, newToken]
    );

    // novy token ako JSON 
    res.json({ token: newToken });
  } catch (err) {
    console.error('Token refresh error:', err.message);
    res.status(500).json({ error: 'Chyba pri generovaní nového tokenu' });
  }
});

//OBLUBENE LOKALITY
app.post('/favorites', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { locationId } = req.body;

  if (!locationId) {
    return res.status(400).json({ error: 'locationId is required' });
  }

  try {
    // Zisti, koľko lokalít má používateľ už pridaných
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
      [userId]
    );

    const favoritesCount = parseInt(countResult.rows[0].count, 10);
    if (favoritesCount >= 5) {
      return res.status(400).json({ error: 'Maximálny počet obľúbených lokalít je 5.' });
    }

    // Over, či už túto lokalitu má
    const existsResult = await pool.query(
      'SELECT 1 FROM favorites WHERE user_id = $1 AND location_id = $2',
      [userId, locationId]
    );

    if (existsResult.rows.length > 0) {
      return res.status(400).json({ error: 'Táto lokalita je už medzi obľúbenými.' });
    }

    // Vlož novú obľúbenú lokalitu
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



app.get('/favorites', authenticateToken, async (req, res) => {
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


app.delete('/favorites/:id', authenticateToken, async (req, res) => {
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



app.get('/users/profile', checkNotAuthenticated, (req, res) => {
  res.render('profile', { user: req.user });
});

app.post('/users/profile', checkNotAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { name, password, password2 } = req.body;
  const errors = [];

  if (!name) errors.push({ message: 'Meno je povinné.' });

  if (password) {
    if (password.length < 6) {
      errors.push({ message: 'Heslo musí mať aspoň 6 znakov.' });
    }
    if (password !== password2) {
      errors.push({ message: 'Heslá sa nezhodujú.' });
    }
  }

  if (errors.length > 0) {
    return res.render('profile', { user: req.user, errors });
  }

  try {
    await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, userId]);

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashedPassword, userId]);
    }

    req.flash('success_msg', 'Profil bol aktualizovaný.');
    res.redirect('/users/dashboard');

  } catch (err) {
    console.error('Chyba pri aktualizácii profilu:', err.message);
    res.status(500).send('Chyba servera.');
  }
});


app.post('/users/delete', checkNotAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    await pool.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
   // await pool.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    req.logout(() => {
      req.flash('success_msg', 'Tvoj účet bol zmazaný.');
      res.redirect('/users/register');
    });

  } catch (err) {
    console.error('Chyba pri mazaní účtu:', err.message);
    res.status(500).send('Chyba servera.');
  }
});


app.patch('/favorites/:id/alert', authenticateToken, async (req, res) => {
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


//odoslanie emailu ihneď
app.post('/favorites/test-alert', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { locationId } = req.body;

  if (!locationId) {
    return res.status(400).json({ error: 'Chýba locationId.' });
  }

  try {
    // lokalita patrí používateľovi?
    const result = await pool.query(
      'SELECT * FROM favorites WHERE user_id = $1 AND location_id = $2',
      [userId, locationId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Táto lokalita nie je medzi tvojimi obľúbenými.' });
    }

    // dáta z airquality
    const response = await axios.get(`${process.env.SERVER_URL}/airquality?id=${locationId}`, {
      headers: {
        Authorization: `Bearer ${process.env.ALERT_INTERNAL_TOKEN}` //pouzity specialy token 
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

