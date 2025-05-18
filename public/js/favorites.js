document.addEventListener('DOMContentLoaded', async () => {
    const favoritesTable = document.getElementById('favorites-table-body');
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

        favoritesTable.innerHTML = "";

        favorites.forEach(fav => {
  const name = locationMap[fav.location_id] || `ID ${fav.location_id}`;
  const row = document.createElement('tr');

  // Lokalita
  const locationCell = document.createElement('td');
  locationCell.classList.add('text-center', 'align-middle');
  locationCell.textContent = name;

  // Switch (checkbox)
  const alertCell = document.createElement('td');
  alertCell.classList.add('text-center', 'align-middle');

  const switchWrapper = document.createElement('div');
  switchWrapper.className = 'form-check form-switch d-inline-flex justify-content-center';

  const switchInput = document.createElement('input');
  switchInput.className = 'form-check-input';
  switchInput.type = 'checkbox';
  switchInput.role = 'switch';
  switchInput.checked = fav.alerts_enabled;

  switchInput.addEventListener('change', () => {
    toggleAlert(fav.id, switchInput.checked);
  });

  switchWrapper.appendChild(switchInput);
  alertCell.appendChild(switchWrapper);

  // Tlačidlo Poslať
  const emailCell = document.createElement('td');
  emailCell.classList.add('text-center', 'align-middle');
  const emailButton = document.createElement('button');
  emailButton.className = 'btn btn-outline-primary btn-sm';
  emailButton.textContent = 'Poslať';
  emailButton.addEventListener('click', () => {
    sendEmail(fav.location_id);
  });
  emailCell.appendChild(emailButton);

  // Tlačidlo Vymazať
  const deleteCell = document.createElement('td');
  deleteCell.classList.add('text-center', 'align-middle');
  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn btn-outline-danger btn-sm';
  deleteButton.textContent = 'X';
  deleteButton.addEventListener('click', () => {
    deleteFavorite(fav.id);
  });
  deleteCell.appendChild(deleteButton);

  // Poskladanie riadku
  row.appendChild(locationCell);
  row.appendChild(alertCell);
  row.appendChild(emailCell);
  row.appendChild(deleteCell);

  favoritesTable.appendChild(row);
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

   const result = await Swal.fire({
        title: 'Si si istý?',
        text: 'Naozaj chceš vymazať túto lokalitu?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Áno, zmazať',
        cancelButtonText: 'Zrušiť'
    });

    if (!result.isConfirmed) return;

    try {
        await fetch(`/favorites/${favoriteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

         Swal.fire({
            icon: 'success',
            title: 'Lokalita bola odstránená',
            timer: 2000,
            showConfirmButton: false
        }).then(() => {
            window.location.reload();
        });

    } catch (error) {
        console.error('Chyba pri mazaní lokality:', error);
        Swal.fire({
            icon: 'error',
            title: 'Chyba',
            text: 'Nepodarilo sa odstrániť lokalitu.'
        });
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
            Swal.fire({
                icon: 'error',
                title: 'Chyba',
                text: data.error || 'Nepodarilo sa uložiť upozornenie.'
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: enabled ? 'Upozornenie aktivované' : 'Upozornenie deaktivované',
                timer: 1500,
                showConfirmButton: false
            });
        }
    } catch (error) {
        console.error('Chyba pri aktualizácii upozornenia:', error);
        alert('Nepodarilo sa uložiť zmenu upozornenia.');
    }
}



async function sendEmail(locationId) {
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
  Swal.fire({
    icon: 'success',
    title: 'Hotovo!',
    text: ' E-mail bol odoslaný.'
  });
} else {
  Swal.fire({
    icon: 'error',
    title: 'Chyba',
    text: data.error
  });
}
    } catch (error) {
      console.error('Chyba pri odosielaní e-mailu:', error.message);
      alert('Nepodarilo sa odoslať e-mail.');
    }
  }
  
