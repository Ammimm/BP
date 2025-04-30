document.addEventListener('DOMContentLoaded', async () => {
    const favoritesList = document.getElementById('favorites-list');
    const backButton = document.getElementById('back-to-dashboard');

    const token = localStorage.getItem('apiAccessToken');
    if (!token) {
        alert('Chýba prístupový token. Skús sa znova prihlásiť.');
        window.location.href = '/users/login'; 
        return;
    }

    try {
        // Načítame najprv lokality s názvami
        const locationsResponse = await fetch('/locations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const locations = await locationsResponse.json();

        // Vytvoríme mapu: id => názov
        const locationMap = {};
        locations.forEach(loc => {
            locationMap[loc.id] = loc.name;
        });

        // Potom načítame obľúbené lokality
        const favoritesResponse = await fetch('/favorites', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const favorites = await favoritesResponse.json();

        favoritesList.innerHTML = "";

        favorites.forEach(fav => {
            const name = locationMap[fav.location_id] || `ID ${fav.location_id}`;
        
            const listItem = document.createElement('li');
            const isChecked = fav.alerts_enabled ? 'checked' : '';
        
            listItem.innerHTML = `
                ${name}
                <label>
                    <input type="checkbox" ${isChecked} onchange="toggleAlert(${fav.id}, this.checked)">
                    📧 nastaviť upozorenia
                </label>
                <button onclick="sendTestEmail(${fav.location_id})">📩 email test</button>
                <button onclick="deleteFavorite(${fav.id})">🗑️ Vymazať</button>
            `;
            favoritesList.appendChild(listItem);
        });
        

    } catch (error) {
        console.error('Chyba pri načítaní obľúbených lokalít:', error);
        alert('Nepodarilo sa načítať obľúbené lokality.');
    }

    backButton.addEventListener('click', () => {
        window.location.href = '/users/dashboard';
    });
});


async function deleteFavorite(favoriteId) {
    const token = localStorage.getItem('apiAccessToken');

    if (!token) {
        alert('Chýba prístupový token. Skús sa znova prihlásiť.');
        window.location.href = '/users/login'; 
        return;
    }

    if (!confirm('Naozaj chceš vymazať túto lokalitu?')) return;

    try {
        await fetch(`/favorites/${favoriteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        alert('Lokalita odstránená.');
        window.location.reload();

    } catch (error) {
        console.error('Chyba pri mazaní lokality:', error);
        alert('Nepodarilo sa odstrániť lokalitu.');
    }
}



async function toggleAlert(favoriteId, enabled) {
    const token = localStorage.getItem('apiAccessToken');

    try {
        const response = await fetch(`/favorites/${favoriteId}/alert`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });

        const data = await response.json();
        if (!response.ok) {
            alert('Chyba: ' + data.error);
        }
    } catch (error) {
        console.error('Chyba pri aktualizácii upozornenia:', error);
        alert('Nepodarilo sa uložiť zmenu upozornenia.');
    }
}



async function sendTestEmail(locationId) {
    const token = localStorage.getItem('apiAccessToken');
  
    try {
      const res = await fetch('/favorites/test-alert', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ locationId })
      });
  
      const data = await res.json();
      if (res.ok) {
        alert('Testovací e-mail odoslaný.');
      } else {
        alert('Chyba: ' + data.error);
      }
    } catch (error) {
      console.error('Chyba pri odosielaní e-mailu:', error.message);
      alert('Nepodarilo sa odoslať e-mail.');
    }
  }
  
