//export WAQI staníc : name + uid + prefix
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const WAQI_TOKEN = process.env.AQICN_API_KEY;
const BOUNDS_URL = `https://api.waqi.info/v2/map/bounds?latlng=47.7,16.8,49.6,22.6&networks=all&token=${WAQI_TOKEN}`;
const outputFile = 'data/results/waqi_station_list.csv';

function uidPrefix(uid) {
  return uid.toString().startsWith('-') ? 'A' : '@';
}

async function fetchWAQIStationsSimple() {
  try {
    const { data } = await axios.get(BOUNDS_URL);
    const stations = data.data;

    const seen = new Set();
    const rows = ['uid;uid_prefixed;name'];

    for (const station of stations) {
      const uid = station.uid;
      const name = station.station?.name?.replace(/;/g, ',').trim();
      const prefixed = uidPrefix(uid) + Math.abs(uid);

      if (!uid || !name || seen.has(name.toLowerCase())) continue;

      seen.add(name.toLowerCase());
      rows.push(`${uid};${prefixed};${name}`);
    }

    fs.writeFileSync(outputFile, rows.join('\n'), 'utf8');
    console.log(`CSV export hotový: ${outputFile}`);
  } catch (err) {
    console.error('Chyba pri sťahovaní WAQI dát:', err.message);
  }
}

fetchWAQIStationsSimple();