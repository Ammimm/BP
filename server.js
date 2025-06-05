require('dotenv').config(); 

const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();

// Middleware
app.use(express.json()); 
app.use(express.urlencoded({extended: false}));
app.use(express.static('public'));
app.use(flash());
app.set ('view engine', 'ejs'); 
app.use(
    session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
    })
); 

// Passport
const initializePassport = require ("./config/passportConfig");
initializePassport(passport);
app.use(passport.initialize());  
app.use(passport.session());


// CRON job 
const startAirQualityCron = require('./cron/alertWorker');
startAirQualityCron(); 


//Swagger
const swaggerDocument = YAML.load('./openapi.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// Routes
const airRoutes = require('./routes/airRoutes');
const userRoutes = require('./routes/users');
const apiTokenRoutes = require('./routes/apiToken');
const favoriteRoutes = require('./routes/favorites');

app.use('/', airRoutes);
app.use('/', userRoutes);
app.use('/', apiTokenRoutes);
app.use('/', favoriteRoutes);



const PORT = process.env.PORT || 4000;

app.listen(PORT,()=> {
    console.log(`Server is running on port ${PORT}`);
});

