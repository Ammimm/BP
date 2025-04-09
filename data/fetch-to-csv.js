require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const AQ_API_KEY = process.env.AQ_API_KEY;

const bboxList = [  
  [21.4, 48.6, 22.6, 49.1], 
  [19.6, 49.4, 20.4, 49.6], 
  [18.5, 49.4, 19.1, 49.6],   
  [16.8, 47.9, 17.3, 48.3],
  [17.8, 48.6, 18.4, 49.1],
  [18.3, 48.4, 18.9, 48.8],
  [18.9, 48.6, 19.4, 48.9],
  [19.1, 49.0, 19.6, 49.4],
  [21.2, 48.6, 21.4, 49.1],
  [20.2, 48.7, 20.5, 49.1],
  [19.0, 48.9, 19.7, 49.2],
  [18.7, 47.8, 19.3, 48.2],
  [17.0, 48.4, 17.7, 48.7],
];

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { "X-API-Key": AQ_API_KEY }
  });
  if (!response.ok) throw new Error(`Chyba: ${response.status} - ${url}`);
  return response.json();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

async function fetchLocationsFromBbox(bbox) {
  const url = `https://api.openaq.org/v3/locations?bbox=${bbox.join(',')}`;
  const data = await fetchJSON(url);
  return data.results.map(loc => ({
    id: loc.id,
    name: loc.name,
    locality: loc.locality
  }));
}

async function fetchSensorsForLocation(locationId) {
  const url = `https://api.openaq.org/v3/locations/${locationId}`;
  const data = await fetchJSON(url);
  const location = data.results[0];
  return location.sensors.map(sensor => ({
    sensorId: sensor.id,
    parameter: sensor.parameter.name
  }));
}

async function fetchLatestForSensor(sensorId) {
  const url = `https://api.openaq.org/v3/sensors/${sensorId}`;
  const data = await fetchJSON(url);
  const result = data.results[0];
  return {
    parameter: result.parameter.name,
    value: result.latest?.value ?? null,
    datetime: result.latest?.datetime?.local ?? null
  };
}

function exportToCSV(results, filename) {
  const headers = [
    "location_id",
    "location_name",
    "locality",
    "sensor_id",
    "parameter",
    "value",
    "datetime"
  ];

  const lines = [
    headers.join(";"),
    ...results.map(r =>
      headers.map(h => `"${(r[h] ?? "").toString().replace(/"/g, '""')}"`).join(";")
    )
  ];

  fs.writeFileSync(filename, lines.join("\n"), "utf8");
  console.log(` Dáta uložené do súboru ${filename}`);
}

async function main() {
  const results = [];

  for (const bbox of bboxList) {
    await delay(1000); //aby sa nepretazila api
    const locations = await fetchLocationsFromBbox(bbox);

    for (const loc of locations) {
      await delay(1000);
      const sensors = await fetchSensorsForLocation(loc.id);

      for (const sensor of sensors) {
        try {
          await delay(1000);  
          const latest = await fetchLatestForSensor(sensor.sensorId);
          results.push({
            location_id: loc.id,
            location_name: loc.name,
            locality: loc.locality,
            sensor_id: sensor.sensorId,
            parameter: latest.parameter,
            value: latest.value,
            datetime: latest.datetime
          });
        } catch (err) {
          console.error(` chyba pri senzore ${sensor.sensorId}:`, err.message);
        }
      }
    }
  }

  exportToCSV(results, "data/results/air_quality_results.csv");
}

main().catch(console.error);
