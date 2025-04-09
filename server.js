require('dotenv').config(); //citlive udaje ..pridanie env
const express = require('express');
const app = express();
const { pool } = require ("./dbConfig"); //na dattabazu v pool je pripojenie a v env su prihlaosvacie udaje
const bcrypt = require('bcrypt'); // na hashovanie hesla
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const axios = require('axios'); //na odosielanie HTTP požiadaviek

const crypto = require('crypto'); //na generovanie api klucu

app.use(express.static('public'));//na staticke subory co su v public (obrazky,script,css)




const initializePassport = require ("./passportConfig");

initializePassport(passport);

const AQICN_API_KEY = process.env.AQICN_API_KEY;
 



const PORT = process.env.PORT || 4000;


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


// Route na ziskanie kvality ovzdusia podla mesta
app.get('/airquality', async (req, res) => {

    const city = req.query.city; // Mesto z query parametrov

    //console.log("Requested city:", city);

    if (!city) {
        return res.status(400).json({ error: "City is required" });
    }

    try {
        const response = await axios.get(`https://api.waqi.info/feed/${city}/?token=${AQICN_API_KEY}`);
        //console.log("API Response:", response.data); 
        if (response.data.status === "ok") {
            const data = response.data.data; //udaje z api 

            // ak data neobsahuje nastavim null 
            const aqi = data.aqi || null;
            const dominantPollutant = data.dominentpol || null;

            //doplnene 
            // Prekonvertovanie iaqi do rovnakého formátu ako agData
            let convertedMeasurements = {};
            if (data.iaqi) {
                for (const [key, value] of Object.entries(data.iaqi)) {
                    convertedMeasurements[key] = value.v; // Uchováme len číselné hodnoty
                }
            }
            //const measurements = data.iaqi ? JSON.stringify(data.iaqi) : '{}'; //measurmetns prevedieme na json 
            // Prevod na JSON string pre ukladanie do DB
            const measurements = JSON.stringify(convertedMeasurements); 

            try {
                await pool.query(
                    `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements, source) 
                    VALUES ($1, $2, $3, $4, $5) 
                     ON CONFLICT (city)  
                     DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant, 
                   measurements = EXCLUDED.measurements, source = EXCLUDED.source,
                   timestamp = CURRENT_TIMESTAMP`,
    [city, aqi, dominantPollutant, measurements, "waqi"]
                );
                console.log(`Data for ${city} saved to database.`);
            } catch (dbError) {
                console.error("Error saving to database:", dbError);
            }

            res.json(data);
        } else {
            res.status(404).json({ error: "Data not found" });
        }
    } catch (error) {
        console.error("Error fetching air quality data:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

//AgData
app.get('/airquality/agdata', async (req, res) => {
    //const sensorAddr = req.query.sensorAddr || "803428FFFE1CCEE9"; // iba jeden senzor
    //const AGDATA_API_URL = `https://api.agdata.cz/sensors?sensorAddr=${sensorAddr}`;
    const AGDATA_API_URL = `https://api.agdata.cz/sensors?sensorAddr=803428FFFE1CCEE9`;
    const AGDATA_API_KEY = process.env.AGDATA_API_KEY; 
    const city = "Trnovec nad Váhom";
    //console.log("Agdata API KEY:", AGDATA_API_KEY );

    try {
        const response = await axios.get(AGDATA_API_URL, {
            headers: { Authorization: `Bearer ${AGDATA_API_KEY}` }
        });

        //console.log("First Sensor Data:", JSON.stringify(response.data.data[0], null, 2));

        if (!response.data || response.data.data.length === 0) {
            return res.status(404).json({ error: "No data found from Agdata API" });
        }

        const firstSensorData = response.data.data[0]; // Zoberieme len prvý záznam
        const sensorId = firstSensorData.id;
        const pm10 = firstSensorData.data.pm10 || null;
        const pm25 = firstSensorData.data.pm25 || null;
        const pm40 = firstSensorData.data.pm40 || null;
        const pm100 = firstSensorData.data.pm100 || null;
        const so2 = firstSensorData.data.so2 || null;
        const airQualityIndex = firstSensorData.recommendation.index || null;
        const timestamp = firstSensorData.date || new Date().toISOString();


        // Výpočet AQI pre PM₂.₅ a PM₁₀
        const aqi_pm25 = pm25 !== null ? calculateAQI(pm25, pm25_breakpoints) : null;
        const aqi_pm10 = pm10 !== null ? calculateAQI(pm10, pm10_breakpoints) : null;

        // Finálne AQI = max(AQI_PM25, AQI_PM10), ak obe hodnoty existujú
        let aqi = null;
        if (aqi_pm25 !== null && aqi_pm10 !== null) {
            aqi = Math.max(aqi_pm25, aqi_pm10);
        } else if (aqi_pm25 !== null) {
            aqi = aqi_pm25;
        } else if (aqi_pm10 !== null) {
            aqi = aqi_pm10;
        }


       // Výber dominantného znečisťujúceho prvku
       const pollutants = { pm10, pm25, pm40, pm100, so2 };
       const dominantPollutant = Object.keys(pollutants).reduce((a, b) => pollutants[a] > pollutants[b] ? a : b);

       // Uloženie do databázy
       const measurements = JSON.stringify(pollutants); // Prevod údajov na JSON reťazec

       try {
           await pool.query(
            `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements, source) 
            VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (city)  
            DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant, 
                          measurements = EXCLUDED.measurements, source = EXCLUDED.source,
                          timestamp = CURRENT_TIMESTAMP`,
           [city, aqi, dominantPollutant, measurements, "agdata"]
           );
           //console.log(`Data for ${city} saved to database.`);
       } catch (dbError) {
           console.error("Error saving Agdata data to database:", dbError);
       }

       // Odpoveď klientovi
       res.json({
           city,
           aqi,
           dominantPollutant,
           measurements: pollutants,
           timestamp
       });

    } catch (error) {
        console.error("Error fetching Agdata data:", error);
        res.status(500).json({ error: "Failed to fetch data from Agdata API" });
    }
});


//AQ API 
app.get('/airquality/openaq/sensor', async (req, res) => {
    const sensorId = req.query.sensorId;
    const city = req.query.city || 'OpenAQ Sensor'; //potom doplnit nazvy podla sensorId
    const AQ_API_KEY = process.env.AQ_API_KEY;

    if (!sensorId) {
        return res.status(400).json({ error: "sensorId is required" });
    }

    try {
        const response = await axios.get(`https://api.openaq.org/v3/sensors/${sensorId}/measurements`, {
            headers: {
                "X-API-Key": AQ_API_KEY
            }
        });

        const measurementsArray = response.data.results;

        if (!measurementsArray || measurementsArray.length === 0) {
            return res.status(404).json({ error: "No measurements found for this sensor" });
        }

        
        const latestValues = {};
        for (const entry of measurementsArray) {
            const param = entry.parameter.name;
            const value = entry.value;
            if (!(param in latestValues)) {
                latestValues[param] = value;
            }
        }

        if (Object.keys(latestValues).length === 0) {
            return res.status(404).json({ error: "No valid measurement values found" });
        }

        // Výpočet AQI – len ak su dostupn PM hodnoty
        const pm25 = latestValues.pm25 || null;
        const pm10 = latestValues.pm10 || null;

        const aqi_pm25 = pm25 !== null ? calculateAQI(pm25, pm25_breakpoints) : null;
        const aqi_pm10 = pm10 !== null ? calculateAQI(pm10, pm10_breakpoints) : null;

        let aqi = null;
        if (aqi_pm25 !== null && aqi_pm10 !== null) {
            aqi = Math.max(aqi_pm25, aqi_pm10);
        } else if (aqi_pm25 !== null) {
            aqi = aqi_pm25;
        } else if (aqi_pm10 !== null) {
            aqi = aqi_pm10;
        }

        // Dominantný prvok. iba ak máme aspoň jeden parameter
        let dominantPollutant = null;
        const measurementKeys = Object.keys(latestValues);
        if (measurementKeys.length > 0) {
            dominantPollutant = measurementKeys.reduce((a, b) =>
                latestValues[a] > latestValues[b] ? a : b
            );
        }

        // Uloženie do DB
        await pool.query(
            `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements, source)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (city)
            DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant,
                   measurements = EXCLUDED.measurements, source = EXCLUDED.source,
                   timestamp = CURRENT_TIMESTAMP`,
    [city, aqi, dominantPollutant, JSON.stringify(latestValues), "openaq"]
        );

        //console.log(`OpenAQ sensor data for ${city} saved to DB`);

        res.json({
            city,
            aqi,
            dominantPollutant,
            measurements: latestValues
        });

    } catch (error) {
        console.error("Error fetching OpenAQ sensor data:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else if (error.request) {
            console.error("No response received:", error.request);
        } else {
            console.error("Error message:", error.message);
        }
        res.status(500).json({ error: "Failed to fetch data from OpenAQ sensor API" });
    }
});


//na ziskanie udajov z databazy 
app.get('/airquality/db', async (req, res) => {
    const city = req.query.city;

    if (!city) {
        return res.status(400).json({ error: "City is required" });
    }

    try {
        // Načítanie údajov z databázy
        const result = await pool.query(
            `SELECT aqi, dominant_pollutant, measurements, timestamp FROM air_quality WHERE city = $1`,
            [city]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No data found for this city" });
        }

        // Vyberieme prvý záznam 
        const { aqi, dominant_pollutant, measurements, timestamp } = result.rows[0];

        res.json({
            city,
            aqi,
            dominantPollutant: dominant_pollutant,
            measurements,
            timestamp
        });

    } catch (error) {
        console.error("Error fetching air quality data from database:", error);
        res.status(500).json({ error: "Failed to fetch data from database" });
    }
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

app.get('/users/dashboard', checkNotAuthenticated, async (req, res) => {
    try {
        const result = await pool.query('SELECT api_key FROM users WHERE id = $1', [req.user.id]);
        const apiKey = result.rows[0].api_key;
        res.render("dashboard", { user: req.user.name, apiKey });
    } catch (err) {
        console.error("Error fetching API key", err);
        res.send("Error loading dashboard");
    }
});
app.get('/users/logout', (req, res, next) => {
    req.logOut((err) => {
        if (err) {
            return next(err); // Ak sa vyskytne chyba, posunie ju na middleware
        }
        req.flash('success_msg', "You have logged out");
        res.redirect("/users/login");
    });
});


//REGISTER
app.post('/users/register', async (req, res) => {
    let {name, email, password, password2} = req.body;
//console.log({name, email, password, password2});

let errors = [];    

if(!name ||!email ||!password ||!password2){
    errors.push({message: "Please fill in all fields"});
}

if(password.length < 6){
    errors.push({message: "Password must be at least 6 characters long"});
}

if(password!== password2){
    errors.push({message: "Passwords do not match"});
}

if(errors.length > 0){
    res.render("register", {errors});
}else{
    //validacia presla
    let hashedPassword = await bcrypt.hash(password , 10);
    const apiKey = crypto.randomBytes(32).toString('hex');

    //console.log("hashedPassword :", hashedPassword) 

    pool.query(
        `SELECT * FROM users WHERE email = $1` , [email], 
        (err,results)=> {
            if (err) {
                throw err;
            }
            //console.log(results.rows);
            if(results.rows.length > 0){
                errors.push({message: "Email already registered"});
                res.render("register", {errors});
            }else{
                //uzivatel nebol najdeny
                pool.query(
                    `INSERT INTO users (name, email, password, api_key) VALUES ($1, $2, $3 , $4)
                    RETURNING id, password`, 
                    [name, email, hashedPassword, apiKey], 
                    (err, results)=> {
                        if (err) {
                            throw err;
                        }
                        //console.log(results.rows);
                        req.flash("success_msg", "You are registered and can now log in");
                        res.redirect("/users/login");
                    }
                );
            }

        }
    );
    
}

});




app.post('/users/login', passport.authenticate ('local',{
    successRedirect: '/users/dashboard',
    failureRedirect: '/users/login',
    failureFlash: true
})
);

function checkAuthenticated (req, res, next)
{
    if(req.isAuthenticated()){
        return res.redirect("/users/dashboard");
    }
    next();

}

function checkNotAuthenticated (req, res, next){
    if(req.isAuthenticated()){
        return next();
    }
    res.redirect("/users/login");
}



app.listen(PORT,()=> {
    console.log(`Server is running on port ${PORT}`);
});