
# AirCheck

AirCheck is a web application for displaying real-time air quality data across various locations in Slovakia. It integrates multiple data sources and provides a simple dashboard for users to track pollution levels, manage their favorite locations, and set up alerts. In addition to the user interface, AirCheck also exposes a unified API that allows developers to access standardized air quality data programmatically.

---

## Features

- Real-time air quality monitoring 
- Multi-source data integration 
- User registration and login 
- API token generation for authenticated users
- Favorite locations and alert management
- Email alerts when pollution exceeds limits
- Public API 

---

## Requirements

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v16+ recommended)
- [PostgreSQL](https://www.postgresql.org/) (used for storing users, tokens, alerts, and AQ data)
- npm (comes with Node.js)

---

## Database Setup

Set up the PostgreSQL database by creating the required tables using the SQL below.

```sql
-- Table: users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL UNIQUE,
    password VARCHAR(200) NOT NULL
);

-- Table: api_tokens
CREATE TABLE api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: favorites
CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    alerts_enabled BOOLEAN DEFAULT false
);

-- Table: air_quality
CREATE TABLE air_quality (
    id SERIAL PRIMARY KEY,
    city VARCHAR(255) NOT NULL UNIQUE,
    aqi INTEGER,
    dominant_pollutant VARCHAR(50),
    measurements JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    datatimestamp TIMESTAMP
);
```
### How to Run the SQL Code

To create the tables, you need to connect to your PostgreSQL database and run the SQL commands above.

You can use a graphical tool such as [pgAdmin](https://www.pgadmin.org/) to manage your database:

1. Download and install pgAdmin from the official website.
2. Open pgAdmin and connect to your PostgreSQL server.
3. Create a new database.
4. Open a Query Tool and paste the SQL code from the section above.
5. Execute the script.

Alternatively, you can use any PostgreSQL-compatible tool such as DBeaver or a terminal with the `psql` command-line tool.


## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Ammimm/BP.git
npm install
```

---

## Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Database (set your own PostgreSQL credentials)
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=your_db_name
DATABASE_URL=postgres://your_db_username:your_db_password@localhost:5432/your_db_name

# API Keys (you must register to obtain these)
AQICN_API_KEY=your_waqi_api_key          # Get key via: https://aqicn.org/data-platform/token/
AQ_API_KEY=your_openaq_api_key           # Get key via: https://docs.openaq.org/

# JWT tokens are used to authenticate users and secure API access. 
# You can use the example values or generate your own random strings.
JWT_SECRET=jwt_secret


# Internal token for background jobs and server-side actions
# You can use the example values or generate your own random strings.
ALERT_INTERNAL_TOKEN=internal_token


# Email account used for sending alert emails
ALERT_EMAIL_USER=aircheck.notifier@gmail.com
ALERT_EMAIL_PASS=xsvqzafixcwyiouw
# You can use this Gmail account or create your own and generate an app password:
# https://myaccount.google.com/apppasswords

# Server base URL
SERVER_URL=http://localhost:4000

``` 

## Running the Application

Start the server:

```bash
npm start
```

Or with auto-reload (if you use `nodemon`):

```bash
npm run dev
```

The app will run on:  
 `http://localhost:4000`


## Project Structure

```
/config         → Database and passport configuration  
/middleware     → Middleware functions 
/routes         → Express route handlers 
/data           → Scripts and CSV files for location and station data matching 
/public         → Static files  
/views          → EJS templates  
/cron           → Scheduled background jobs  
utils.js        → Utility   
server.js       → Main application file  
```

---


## Main Packages Used

- **express** – web server and routing
- **pg** – PostgreSQL client for Node.js
- **passport** & **passport-local** – authentication system
- **bcrypt** – password hashing
- **jsonwebtoken** – JWT-based authentication
- **dotenv** – environment variable management
- **nodemailer** – sending email alerts
- **swagger-ui-express** – API documentation interface
- **axios** – HTTP client for external API requests
- **ejs** – templating engine for HTML rendering
- **express-session** – session handling
- **express-flash** – flash messages 
- **node-cron** – scheduling background tasks 
- **node-fetch** – fetch API for Node.js
- **csv-parser** – parsing CSV location files
- **string-similarity** – approximate string matching 
- **yamljs** – loading and parsing YAML files 

### Dev Dependencies
- **nodemon** – auto-reloading server for development

---