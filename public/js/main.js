document.addEventListener("DOMContentLoaded", async () => {
  const citySelect = document.getElementById("city");

  const defaultOption = document.createElement("option");
  defaultOption.disabled = true;
  defaultOption.selected = true;
  defaultOption.textContent = "Vyber alebo vyhľadaj lokalitu";
  citySelect.appendChild(defaultOption);

  try {
    const token = localStorage.getItem("apiAccessToken");

    if (!token) {
      alert("Chýba prístupový token. Skús sa znova prihlásiť.");
      return;
    }

    const response = await fetch("/locations", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const locations = await response.json();

    locations.forEach((loc) => {
      const option = document.createElement("option");
      option.value = loc.id;
      option.textContent = loc.name;
      citySelect.appendChild(option);
    });
  } catch (error) {
    console.error("Chyba pri načítaní miest:", error);
    alert("Nepodarilo sa načítať zoznam lokalít.");
  }
});

async function getAirQuality() {
  const citySelect = document.getElementById("city");
  const cityId = citySelect.value;
  const cityName = citySelect.options[citySelect.selectedIndex].text;

  document.getElementById("selected-city").innerText = cityName;

  const pollutantLimits = {
    pm25: 25,
    pm10: 50,
    no2: 200,
    so2: 125,
    o3: 180,
  };

  try {
    const token = localStorage.getItem("apiAccessToken");

    if (!token) {
      alert("Chýba prístupový token. Skús sa znova prihlásiť.");
      return;
    }

    const url = `/airquality?id=${encodeURIComponent(cityId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (data.error) {
      alert("Error: " + data.error);
      return;
    }

    document.getElementById("data-source").textContent = data.source || "-";
    document.getElementById("data-timestamp").textContent = data.datatimestamp
      ? new Date(data.datatimestamp).toLocaleString("sk-SK")
      : "-";
    document.getElementById("aqi").innerText = data.aqi ?? "N/A";
    document.getElementById("dominant").innerText =
      data.dominantPollutant || "Unknown";

    const measurementsList = document.getElementById("measurements");
    measurementsList.innerHTML = "";

    const measurements =
      typeof data.measurements === "string"
        ? JSON.parse(data.measurements)
        : data.measurements;

    for (const [key, value] of Object.entries(measurements)) {
  const listItem = document.createElement("li");
  listItem.className = "list-group-item align-items-center";
  listItem.innerHTML = `
    <span class="text-uppercase">${key}</span>
    <span class="badge bg-primary rounded-pill">${value}</span>
  `;
  measurementsList.appendChild(listItem);
}

    // GRAF
    const canvas = document.getElementById("measurementsChart");
    if (!canvas) {
      console.warn("Graf neexistuje v DOM. Preskočené vykreslenie.");
      return;
    }
    const ctx = canvas.getContext("2d");

    // vyber merani
    const keysToDisplay = ["pm25", "pm10", "no2", "so2", "o3"];
    const labels = [];
    const values = [];
    const backgroundColors = [];

    keysToDisplay.forEach((key) => {
      const value = measurements[key];
      if (value !== undefined) {
        labels.push(key.toUpperCase());
        values.push(value);

        let color = "green";
        if (
          (key === "pm25" && value > 25) ||
          (key === "pm10" && value > 50) ||
          (key === "no2" && value > 200) ||
          (key === "so2" && value > 125)
        ) {
          color = "orange";
        }
        if (
          (key === "pm25" && value > 50) ||
          (key === "pm10" && value > 100) ||
          (key === "no2" && value > 400) ||
          (key === "so2" && value > 250)
        ) {
          color = "red";
        }

        backgroundColors.push(color);
      }
    });

    // dataset s limitmi
    const limitValues = values.map((_, i) => {
      const key = labels[i].toLowerCase();
      return pollutantLimits[key] || null;
    });

    let aqiInfo = "";
    const aqi = data.aqi;


if (typeof aqi !== "number" || isNaN(aqi)) {
  aqiInfo = "ℹ️ Z dostupných hodnôt pre túto lokalitu sa nedá vypočítať index kvality ovzdušia (AQI).";
} else if (aqi <= 50) {
  aqiInfo = "✅ Kvalita ovzdušia je dobrá. Žiadne zdravotné riziko.";
} else if (aqi <= 100) {
  aqiInfo = "⚠️ Mierne zvýšené hodnoty. Citlivé osoby by mali obmedziť dlhodobý pobyt vonku.";
} else if (aqi <= 150) {
  aqiInfo = "⚠️ Nezdravé pre citlivé skupiny. Osoby s ochoreniami dýchacích ciest by mali obmedziť pobyt vonku.";
} else if (aqi <= 200) {
  aqiInfo = "⚠️ Nezdravé. Všetci by mali obmedziť dlhodobý pobyt vonku.";
} else if (aqi <= 300) {
  aqiInfo = "⚠️ Veľmi nezdravé. Odporúča sa nevychádzať von, najmä citlivé skupiny.";
} else {
  aqiInfo = "⚠️ Nebezpečné! Vyhnite sa všetkým vonkajším aktivitám.";
}

// Zobrazenie AQI upozornenia
const aqiWarningDiv = document.getElementById("aqi-warning");
if (aqiWarningDiv) {
  aqiWarningDiv.textContent = aqiInfo;
  aqiWarningDiv.style.display = "block";
}


    let warningMessage = "";

    labels.forEach((label, i) => {
      const key = label.toLowerCase();
      const value = values[i];
      const limit = pollutantLimits[key];

      if (limit && value > limit) {
        warningMessage += `⚠️ Hodnota ${label} (${value}) prekračuje limit (${limit}). `;
      }
    });

    const warningDiv = document.getElementById("graph-warning");
    warningDiv.textContent = warningMessage;
    warningDiv.style.display = warningMessage ? "block" : "none";

    if (window.measurementsChart instanceof Chart) {
      window.measurementsChart.destroy();
    }

    window.measurementsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Aktuálne hodnoty",
            data: values,
            backgroundColor: backgroundColors,
          },
          {
            label: "Hraničné hodnoty",
            data: limitValues,
            backgroundColor: "rgba(255, 0, 0, 0.3)",
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              generateLabels: function (chart) {
                return [
                  { text: "V norme", fillStyle: "green" },
                  { text: " Zvýšené hodnoty", fillStyle: "orange" },
                  { text: " Kritické hodnoty", fillStyle: "red" },
                  {
                    text: " Hraničné limity",
                    fillStyle: "rgba(255, 0, 0, 0.3)",
                  },
                ];
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "µg/m³",
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching air quality data:", error);
    alert("Failed to load air quality data.");
  }
}

//favorites
async function addFavorite() {
  const citySelect = document.getElementById("city");
  const cityId = citySelect.value.trim();

  if (!cityId) {
    alert("Prosím vyber lokalitu pred pridaním.");
    return;
  }

  console.log("Vybrané cityId:", cityId);

  const token = localStorage.getItem("apiAccessToken");

  if (!token) {
    alert("Chýba prístupový token. Skús sa znova prihlásiť.");
    return;
  }

  try {
    const response = await fetch("/favorites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locationId: cityId }),
    });

    const data = await response.json();

    if (response.ok) {
      Swal.fire({
        icon: "success",
        title: "Hotovo",
        text: "Lokalita bola pridaná medzi obľúbené.",
        timer: 1500,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        icon: "error",
        title: "Chyba",
        text: data.error || "Nepodarilo sa pridať lokalitu.",
      });
    }
  } catch (error) {
    console.error("Chyba pri pridávaní obľúbenej lokality:", error);
    alert("Nepodarilo sa pridať lokalitu medzi obľúbené.");
  }
}

$(document).ready(function () {
  $("#city").select2({
    placeholder: "Vyber alebo vyhľadaj lokalitu",
    width: "100%",
  });
});
