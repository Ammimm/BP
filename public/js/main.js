document.addEventListener("DOMContentLoaded", async () => {
    const citySelect = document.getElementById("city");
    
    try {
        const response = await fetch("/locations");
        const locations = await response.json();

        locations.forEach(loc => {
            const option = document.createElement("option");
            option.value = loc.id; // budeš posielať ID
            option.textContent = loc.name;
            citySelect.appendChild(option);
        });
    } catch (error) {
        console.error("Chyba pri načítaní miest:", error);
    }
});



async function getAirQuality() {
    const cityId = document.getElementById("city").value;
    document.getElementById("selected-city").innerText = cityId;

    try {
        const response = await fetch(`/airquality?id=${encodeURIComponent(cityId)}`);
        const data = await response.json();

        if (data.error) {
            alert("Error: " + data.error);
            return;
        }

        document.getElementById("aqi").innerText = data.aqi ?? "N/A";
        document.getElementById("dominant").innerText = data.dominantPollutant || "Unknown";

        const measurementsList = document.getElementById("measurements");
        measurementsList.innerHTML = "";

        const measurements = typeof data.measurements === "string"
            ? JSON.parse(data.measurements)
            : data.measurements;

        for (const [key, value] of Object.entries(measurements)) {
            const listItem = document.createElement("li");
            listItem.innerText = `${key.toUpperCase()}: ${value}`;
            measurementsList.appendChild(listItem);
        }

    } catch (error) {
        console.error("Error fetching air quality data:", error);
        alert("Failed to load air quality data.");
    }
}
