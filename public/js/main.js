document.addEventListener("DOMContentLoaded", async () => {
    const citySelect = document.getElementById("city");

    try {
        const token = localStorage.getItem('apiAccessToken');

        if (!token) {
            alert('Chýba prístupový token. Skús sa znova prihlásiť.');
            return;
        }

        const response = await fetch("/locations", {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const locations = await response.json();

        locations.forEach(loc => {
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

    try {
        const token = localStorage.getItem('apiAccessToken');

        if (!token) {
            alert('Chýba prístupový token. Skús sa znova prihlásiť.');
            return;
        }

        const url = `/airquality?id=${encodeURIComponent(cityId)}`;

        console.log('Posielam požiadavku na:', url);
        console.log('Používam token:', token);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

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



//favorites 
async function addFavorite() {
    const citySelect = document.getElementById("city");
    const cityId = citySelect.value.trim();

    if (!cityId) {
        alert('Prosím vyber lokalitu pred pridaním.');
        return;
    }

    console.log('Vybrané cityId:', cityId);

    const token = localStorage.getItem('apiAccessToken');

    if (!token) {
        alert('Chýba prístupový token. Skús sa znova prihlásiť.');
        return;
    }

    try {
        const response = await fetch('/favorites', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ locationId: cityId })
        });

        const data = await response.json();

        if (response.ok) {
    Swal.fire({
        icon: 'success',
        title: 'Hotovo',
        text: 'Lokalita bola pridaná medzi obľúbené.',
        timer: 1500,
        showConfirmButton: false
    });
} else {
    Swal.fire({
        icon: 'error',
        title: 'Chyba',
        text: data.error || 'Nepodarilo sa pridať lokalitu.'
    });
}


    } catch (error) {
        console.error('Chyba pri pridávaní obľúbenej lokality:', error);
        alert('Nepodarilo sa pridať lokalitu medzi obľúbené.');
    }
}
