const fs = require('fs');
const csv = require('csv-parser');
const stringSimilarity = require('string-similarity');
//vypočíta skóre podobnosti medzi dvoma reťazcami
//umožní porovnať názov s celým zoznamom a nájsť najbližšiu zhodu


const airQualityCSV = 'data/results/aq_stations_list.csv';
const waqiCSV = 'data/results/waqi_station_list.csv';
const outputCSV = 'data/results/matched_locations.csv';

const threshold = 0.49;


//normalizacia ,cistenie .. aby bol lepsi match
const normalizeName = (str) => {
  return (str || '')
    .toLowerCase()
    .replace(/["\-,.]/g, '')
    .replace(/\bslovakia\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

function loadCSV(filePath, separator = ';') {
  return new Promise((resolve) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv({ separator }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows));
  });
}


(async () => {
  const aqRows = await loadCSV(airQualityCSV);
  const waqiRows = await loadCSV(waqiCSV);

  const aqData = aqRows.map(row => ({
    location_id: row.location_id,
    location_name: row.location_name,
    location_from_coords: row.location_from_coords,
    locality: row.locality,
    sensor_ids: row.sensor_ids,
    normalized_name: normalizeName(row.location_name),
    normalized_coords: normalizeName(row.location_from_coords)
  }));

  const waqiData = waqiRows.map(row => ({
    uid: row.uid,
    uid_prefixed: row.uid_prefixed,
    name: row.name,
    normalized_name: normalizeName(row.name)
  }));

  const resultRows = [];
  const matchedPairs = [];
  const matchedWaqiIndexes = new Set();

  for (const [index, aq] of aqData.entries()) {
    const waqiNames = waqiData.map(w => w.normalized_name);

    //hladame najlepsi match
    const nameMatch = stringSimilarity.findBestMatch(aq.normalized_name, waqiNames);
    const coordsMatch = stringSimilarity.findBestMatch(aq.normalized_coords, waqiNames);


    const best =
      nameMatch.bestMatch.rating >= coordsMatch.bestMatch.rating
        ? nameMatch
        : coordsMatch;

    const bestMatch = best.bestMatch;
    const bestMatchIndex = best.bestMatchIndex;

    const queryName = normalizeName(aq.location_from_coords || aq.location_name);

    // kontrola podla string-similarity kniznice 
    if (bestMatch.rating >= threshold) {
      const waqi = waqiData[bestMatchIndex];
      matchedWaqiIndexes.add(bestMatchIndex);

      resultRows.push({
        id: index + 1,
        query_name: queryName,
        location_id: aq.location_id,
        location_name: aq.location_name,
        location_from_coords: aq.location_from_coords,
        locality: aq.locality,
        sensor_ids: aq.sensor_ids,
        uid: waqi.uid,
        uid_prefixed: waqi.uid_prefixed,
        waqi_name: waqi.name,
        match_score: bestMatch.rating.toFixed(2)
      });

      matchedPairs.push({
        aq_name: aq.location_name,
        aq_coords: aq.location_from_coords,
        waqi_name: waqi.name,
        score: bestMatch.rating.toFixed(2)
      });

      //iba z AQ
    } else {
      resultRows.push({
        id: index + 1,
        query_name: queryName,
        location_id: aq.location_id,
        location_name: aq.location_name,
        location_from_coords: aq.location_from_coords,
        locality: aq.locality,
        sensor_ids: aq.sensor_ids,
        uid: '',
        uid_prefixed: '',
        waqi_name: '',
        match_score: ''
      });
    }
  }

  // iba z WAQI
  waqiData.forEach((w, i) => {
    if (!matchedWaqiIndexes.has(i)) {
      resultRows.push({
        id: resultRows.length + 1,
        query_name: normalizeName(w.name),
        location_id: '',
        location_name: '',
        location_from_coords: '',
        locality: '',
        sensor_ids: '',
        uid: w.uid,
        uid_prefixed: w.uid_prefixed,
        waqi_name: w.name,
        match_score: ''
      });
    }
  });

  // Výpis
  console.log(`\n Zhodných lokalít: ${matchedPairs.length}`);
  matchedPairs.forEach((pair, index) => {
    console.log(
      `${index + 1}. AQ: "${pair.aq_name}" / "${pair.aq_coords}" ⇄ WAQI: "${pair.waqi_name}" (similarita: ${pair.score})`
    );
  });

  const header =
    'id;query_name;location_id;location_name;location_from_coords;locality;sensor_ids;uid;uid_prefixed;waqi_name;match_score';

  const lines = resultRows.map(row =>
    [
      row.id || '',
      row.query_name || '',
      row.location_id || '',
      row.location_name || '',
      row.location_from_coords || '',
      row.locality || '',
      row.sensor_ids || '',
      row.uid || '',
      row.uid_prefixed || '',
      row.waqi_name || '',
      row.match_score || ''
    ].join(';')
  );

  fs.writeFileSync(outputCSV, [header, ...lines].join('\n'), 'utf8');
  console.log(`Zlúčené CSV uložené do: ${outputCSV}`);
})();
