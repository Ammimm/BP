require('dotenv').config(); //citlive udaje ..pridanie env
const express = require('express');
const app = express();
const { pool } = require ("./dbConfig"); //na dattabazu v pool je pripojenie a v env su prihlaosvacie udaje
const bcrypt = require('bcrypt'); // na hashovanie hesla
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const axios = require('axios'); //na odosielanie HTTP požiadaviek


app.use(express.static('public'));//na staticke subory co su v public (obrazky,script,css)




const initializePassport = require ("./passportConfig");

initializePassport(passport);

const AQICN_API_KEY = process.env.AQICN_API_KEY;
console.log("API KEY:", process.env.AQICN_API_KEY); //kontrol log



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


// Route na ziskanie kvality ovzdusia podla mesta
app.get('/airquality', async (req, res) => {

    const city = req.query.city; // Mesto z query parametrov

    console.log("Requested city:", city); // Logovanie 

    if (!city) {
        return res.status(400).json({ error: "City is required" });
    }

    try {
        const response = await axios.get(`https://api.waqi.info/feed/${city}/?token=${AQICN_API_KEY}`);
        console.log("API Response:", response.data); // Logovanie odpovede
        if (response.data.status === "ok") {
            const data = response.data.data; //udaje z api 

            // ak data neobsahuje nastavim null 
            const aqi = data.aqi || null;
            const dominantPollutant = data.dominentpol || null;
            const measurements = data.iaqi ? JSON.stringify(data.iaqi) : '{}'; //measurmetns prevedieme na json  

            try {
                await pool.query(
                    `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements) 
                     VALUES ($1, $2, $3, $4) 
                     ON CONFLICT (city)  
                     DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant, 
                                   measurements = EXCLUDED.measurements, timestamp = CURRENT_TIMESTAMP`,
                    [city, aqi, dominantPollutant, measurements]
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






app.get('/', (req, res) => {
    res.render("index"); 
})

app.get('/users/register',checkAuthenticated, (req, res) => {
    res.render("register"); 
})

app.get('/users/login',checkAuthenticated ,(req, res) => {
    res.render("login"); 
})

app.get('/users/dashboard', checkNotAuthenticated,(req, res) => {
    res.render("dashboard", {user: req.user.name}); 
})
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
console.log({name, email, password, password2});

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

    console.log("hashedPassword :", hashedPassword) 

    pool.query(
        `SELECT * FROM users WHERE email = $1` , [email], 
        (err,results)=> {
            if (err) {
                throw err;
            }
            console.log(results.rows);
            if(results.rows.length > 0){
                errors.push({message: "Email already registered"});
                res.render("register", {errors});
            }else{
                //uzivatel nebol najdeny
                pool.query(
                    `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)
                    RETURNING id, password`, 
                    [name, email, hashedPassword], 
                    (err, results)=> {
                        if (err) {
                            throw err;
                        }
                        console.log(results.rows);
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