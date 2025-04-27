require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const AQ_API_KEY = process.env.AQ_API_KEY;


//suradnice
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


  //volame funkciu aby vybrala iba ulicu a mesto 
  function extractCompactLocation(address) {
    const street = address.road || address.pedestrian || address.path || '';
    const city = address.city || address.town || address.village || address.municipality || '';
    return [street, city].filter(Boolean).join(', ');
  }


  //na zistenie nazvu lokacie 
  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    await delay(1000); // aby sa nepretazila api 
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "bp-airquality-script/1.0" }
      });
      const data = await response.json();
      return extractCompactLocation(data.address || {}); 
    } catch (err) {
      console.error(` Chyba pri reverse geocoding pre ${lat},${lon}:`, err.message);
      return '';
    }
  }



// Získanie lokalít z OpenAQ podľa BBOX
async function fetchLocationsFromBbox(bbox) {
  const url = `https://api.openaq.org/v3/locations?bbox=${bbox.join(',')}`;
  const data = await fetchJSON(url);
  return data.results.map(loc => ({
    id: loc.id,
    name: loc.name,
    locality: loc.locality,
    latitude: loc.coordinates?.latitude,
    longitude: loc.coordinates?.longitude
  }));
}


//Získanie senzorov pre danu lokalitu , zoznam senzorov
async function fetchSensorsForLocation(locationId) {
  const url = `https://api.openaq.org/v3/locations/${locationId}`;
  const data = await fetchJSON(url);
  const location = data.results[0];
  return location.sensors.map(sensor => sensor.id);
}


//export
function exportToCSV(results, filename) {
  const headers = [
    "location_id",
    "location_name",
    "locality",
    "location_from_coords",
    "sensor_ids",
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
  const seenLocations = new Set(); //na jedinecne hodnoty

  for (const bbox of bboxList) {
    await delay(500); //aby sa nepretazila api
    const locations = await fetchLocationsFromBbox(bbox);

    for (const loc of locations) {
      const key = loc.id;
      if (seenLocations.has(key)) continue;
      seenLocations.add(key);

      await delay(500);
      const sensorIds = await fetchSensorsForLocation(loc.id);
      const locationFromCoords = await reverseGeocode(loc.latitude, loc.longitude);

      results.push({
        location_id: loc.id,
        location_name: loc.name,
        locality: loc.locality,
        location_from_coords: locationFromCoords,
        sensor_ids: sensorIds.join(',')
      });
    }
  }

  exportToCSV(results, "data/results/aq_stations_list.csv");
}

main().catch(console.error);
