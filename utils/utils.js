require('dotenv').config();

const axios = require('axios');
const { pool } = require('../config/dbConfig');
const fs = require('fs');
const csv = require('csv-parser');


const AQICN_API_KEY = process.env.AQICN_API_KEY;
const AQ_API_KEY = process.env.AQ_API_KEY; 


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

module.exports = matchedLocations;


function isDataRecent(timestamp) {
    const now = new Date();
    const ts = new Date(timestamp);
    const diffMinutes = (now - ts) / (1000 * 60);
    return diffMinutes < 60;
  }


function calculateAQI(concentration, breakpoints) {
    for (let i = 0; i < breakpoints.length; i++) {
        const [cLow, cHigh, iLow, iHigh] = breakpoints[i];

        if (concentration >= cLow && concentration <= cHigh) {
            return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow);
        }
    }
    return 500; 
}

const pm25_breakpoints = [
    [0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 500.4, 301, 500]
];

const pm10_breakpoints = [
    [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
    [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]
];


  // Weighted Average
  function mergeMeasurements(waqi, openaq) {
    const result = {};
    const keys = new Set([...Object.keys(waqi), ...Object.keys(openaq)]);
    keys.forEach(key => {
      const w = waqi[key], o = openaq[key];
      if (w != null && o != null) result[key] = +(w * 0.7 + o * 0.3).toFixed(2);
      else if (w != null) result[key] = w;
      else if (o != null) result[key] = o;
    });
    return result;
  }


 async function handleAirQualityRequest(req, res) {
  const id = req.query.id;
  const rawQueryName = req.query.query_name;
  const queryName = req.query.query_name?.toLowerCase();

  if (!id && !queryName) {
    return res.status(400).json({ error: 'Zadaj buď ?id alebo ?query_name' });
  }

  const record = matchedLocations[id] || matchedLocations[queryName] || matchedLocations[rawQueryName];
  if (!record) {
    return res.status(404).json({ error: 'Lokalita nebola nájdená' });
  }

  const city = record.query_name || record.location_from_coords || record.location_name || 'Unknown';


  let waqiResult = null;
  let openaqResult = null;

  // database
  try {
    const dbResult = await pool.query(`SELECT * FROM air_quality WHERE city = $1`, [city]);
    if (dbResult.rows.length > 0) {
    oldDbRow = dbResult.rows[0];
    if (isDataRecent(oldDbRow.datatimestamp)) {
      return res.json(oldDbRow); 
    }
  }
  } catch (err) {
    console.error('DB chyba:', err.message);
    return res.status(500).json({ error: 'DB chyba' });
  }

  // WAQI
  if (record.uid_prefixed) {
    try {
      const waqiUrl = `https://api.waqi.info/feed/${record.uid_prefixed}/?token=${AQICN_API_KEY}`;
      const response = await axios.get(waqiUrl);
      const data = response.data.data;

      waqiResult = {
        aqi: data.aqi ?? null,
        dominantPollutant: data.dominentpol ?? null,
        datatimestamp: data.time?.iso ?? null,
        measurements: Object.fromEntries(
          Object.entries(data.iaqi || {}).map(([k, v]) => [k, v.v])
        )
      };
    } catch (error) {
      console.error('WAQI chyba:', error.message);
    }
  }

  // OpenAQ
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
            const tst = new Date();
            tst.setMinutes(0, 0, 0); 
            datatimestamp = tst.toISOString();
          }
          

        }
      } catch (error) {
        console.warn(`Senzor ${sensorId} chyba:`, error.message);
      }
    }

    if (Object.keys(measurements).length > 0) {
      openaqResult = {
        datatimestamp: datatimestamp ?? new Date().toISOString(),
        measurements
      };
    }
  }
    

  

  // result
  let finalMeasurements = null;
  let finalSource = null;

  if (waqiResult && openaqResult) {
    finalMeasurements = mergeMeasurements(waqiResult.measurements, openaqResult.measurements);
    finalSource = 'WAQI,openAQ';
  } else if (waqiResult) {
    finalMeasurements = waqiResult.measurements;
    finalSource = 'WAQI';
  } else if (openaqResult) {
    finalMeasurements = openaqResult.measurements;
    finalSource = 'openAQ';
  } else {
    if (oldDbRow) {
    return res.json(oldDbRow); 
  }
    return res.status(404).json({ error: 'Z dostupných zdrojov neboli nájdené žiadne dáta pre túto lokalitu' });
  }

  const pm25 = finalMeasurements.pm25 ?? null;
  const pm10 = finalMeasurements.pm10 ?? null;
  const aqi_pm25 = pm25 !== null ? calculateAQI(pm25, pm25_breakpoints) : null;
  const aqi_pm10 = pm10 !== null ? calculateAQI(pm10, pm10_breakpoints) : null;
  let aqi;

if ((finalSource === 'WAQI' || finalSource === 'WAQI,openAQ') && waqiResult?.aqi !== null) {
  aqi = waqiResult.aqi;
} else {
  aqi = Math.max(aqi_pm25 ?? 0, aqi_pm10 ?? 0) || null;
};

  let dominantPollutant;

if (finalSource === 'WAQI' || finalSource === 'WAQI,openAQ' && waqiResult?.dominantPollutant) {
  dominantPollutant = waqiResult.dominantPollutant;
} else {
  const pollutantAQIs = {};

  if (pm25 !== null) pollutantAQIs.pm25 = calculateAQI(pm25, pm25_breakpoints);
  if (pm10 !== null) pollutantAQIs.pm10 = calculateAQI(pm10, pm10_breakpoints);


 const pollutantKeys = Object.keys(pollutantAQIs);

if (pollutantKeys.length > 0) {
  dominantPollutant = pollutantKeys.reduce((a, b) =>
    pollutantAQIs[a] > pollutantAQIs[b] ? a : b
  );
} else {
  dominantPollutant = null;
}
}

  const datatimestamp = waqiResult?.datatimestamp || openaqResult?.datatimestamp || new Date().toISOString();

  await pool.query(
    `INSERT INTO air_quality (city, aqi, dominant_pollutant, measurements, source, datatimestamp, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (city)
     DO UPDATE SET aqi = EXCLUDED.aqi, dominant_pollutant = EXCLUDED.dominant_pollutant,
                   measurements = EXCLUDED.measurements, source = EXCLUDED.source,
                   datatimestamp = EXCLUDED.datatimestamp, timestamp = CURRENT_TIMESTAMP`,
    [city, aqi, dominantPollutant, JSON.stringify(finalMeasurements), finalSource, datatimestamp]
  );

  return res.json({ city, aqi, dominantPollutant, measurements: finalMeasurements, datatimestamp, source: finalSource });
}

function handleLocationsRequest(req, res) {
  const locationsList = Object.values(matchedLocations)
    .filter((row, index, self) =>
      index === self.findIndex(r => r.id === row.id)
    )
    .map(row => ({
      id: row.id,
      name: row.query_name || row.location_from_coords || row.location_name || 'Neznáma lokalita'
    }));
  res.json(locationsList);
}

module.exports = {
  handleAirQualityRequest,
  handleLocationsRequest
};
