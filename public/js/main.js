
async function getAirQuality() {
    const city = document.getElementById("city").value;
    document.getElementById("selected-city").innerText = city;

    try {
        // údaje do databázy
        if (city === "Trnovec nad Váhom") {
            await fetch(`/airquality/agdata?city=${encodeURIComponent(city)}`);
        } else {
            await fetch(`/airquality?city=${encodeURIComponent(city)}`);
        }

        //údaje z databázy a zobrazíme ich
        const response = await fetch(`/airquality/db?city=${encodeURIComponent(city)}`);
        const data = await response.json();

        if (data.error) {
            alert("Error: " + data.error);
            return;
        }

        document.getElementById("aqi").innerText = data.aqi !== null ? data.aqi : "N/A";
        document.getElementById("dominant").innerText = data.dominantPollutant || "Unknown";

        const measurementsList = document.getElementById("measurements");
        measurementsList.innerHTML = "";

        if (data.measurements) {
            const measurements = typeof data.measurements === "string" ? JSON.parse(data.measurements) : data.measurements;
            for (const [key, value] of Object.entries(measurements)) {
                const listItem = document.createElement("li");
                listItem.innerText = `${key.toUpperCase()}: ${value}`;
                measurementsList.appendChild(listItem);
            }
        }

    } catch (error) {
        console.error("Error fetching air quality data:", error);
        alert("Failed to load air quality data.");
    }
}