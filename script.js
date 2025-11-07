document.addEventListener('DOMContentLoaded', async () => {
    // --- API Credentials ---
    let API_KEY = localStorage.getItem('API_KEY');
    let DB_URL = localStorage.getItem('DB_URL');

    // --- Caching Album Data ---
    let albumCache = [];
    const albumsGrid = document.getElementById('albums-grid');

    /**
     * A generic function to make calls to the REST API.
     */
    async function apiCall(userApiKey, userDbUrl, endpoint = '', method = 'GET', body = null) {
        if (!userApiKey || !userDbUrl) {
            throw new Error('API Key or DB URL not provided.');
        }
        const base = userDbUrl.endsWith('/') ? userDbUrl.slice(0, -1) : userDbUrl;
        const fullUrl = endpoint ? (base + (endpoint.startsWith('/') ? endpoint : '/' + endpoint)) : base;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'x-apikey': userApiKey,
                'cache-control': 'no-cache'
            }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            const response = await fetch(fullUrl, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`API Error: ${response.status} - ${errorData.message || 'Unknown error'}`);
            }
            // If the response is successful, we return the JSON body.
            // For validation, we only care that this call doesn't throw an error.
            return await response.json();
        } catch (error) {
            console.error('API Call Failed:', error);
            throw error;
        }
    }

    /**
     * Creates an HTML element for a single album.
     */
    function createAlbumCard(album) {
        const card = document.createElement('div');
        card.className = 'album-card bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden cursor-pointer transition-transform hover:-translate-y-1 select-none';

        card.dataset.title = album.title;
        card.dataset.description = album.description || 'No description available.';
        card.dataset.images = JSON.stringify(album.imageUrls);

        const imageUrl = album.imageUrls && album.imageUrls.length > 0 ? album.imageUrls[0] : '';

        card.innerHTML = `
            <div class="relative overflow-hidden">
                <div class="skeleton-loader absolute inset-0"></div>
                <img data-src="${imageUrl}" class="lazy-image image">
                <div class="absolute inset-0"></div>
            </div>
            <div class="p-3"><h3 class="album-title text-lg font-semibold">${album.title}</h3></div>
        `;
        return card;
    }

    /**
     * Fetches albums from the API and populates the grid.
     */
    async function fetchAndDisplayAlbums() {
        albumsGrid.innerHTML = ''; // Clear previous content
        // Display skeleton loaders
        for (let i = 0; i < 8; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'album-card bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden';
            skeletonCard.innerHTML = `
                <div class="relative overflow-hidden h-full">
                    <div class="skeleton-loader absolute inset-0"></div>
                </div>`;
            albumsGrid.appendChild(skeletonCard);
        }

        try {
            const albums = await apiCall(API_KEY, DB_URL);
            albumsGrid.innerHTML = '';

            albums.forEach(album => {
                const card = createAlbumCard(album);
                albumsGrid.appendChild(card);
            });

            initializeAlbumCardLogic();

        } catch (error) {
            albumsGrid.innerHTML = `<p class="text-red-500 col-span-full text-center">Failed to load albums. Please check your API credentials in the menu and your network connection.</p>`;
        }
    }

    /**
     * Initializes all interactive logic for album cards.
     */
    function initializeAlbumCardLogic() {
        document.querySelectorAll('.album-card').forEach(card => {
            card.replaceWith(card.cloneNode(true));
        });

        document.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', () => handleCardClick(card));
        });

        albumCache = [];
        document.querySelectorAll('.album-card').forEach(card => {
            albumCache.push({
                title: card.querySelector('.album-title').textContent.toLowerCase(),
                element: card
            });
        });

        const lazyImages = document.querySelectorAll('#albums-grid .lazy-image');
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;

                        img.onload = () => {
                            img.classList.add('loaded');
                            const skeleton = img.previousElementSibling;
                            if (skeleton && skeleton.classList.contains('skeleton-loader')) {
                                setTimeout(() => skeleton.remove(), 400);
                            }
                        };

                        img.src = img.dataset.src;
                        observer.unobserve(img);
                    }
                });
            }, { root: albumsGrid, rootMargin: '100px 0px', threshold: 0.01 });
            lazyImages.forEach(img => imageObserver.observe(img));
        } else {
            lazyImages.forEach(img => {
                img.src = img.dataset.src;
                img.classList.add('loaded');
            });
        }
    }


    // --- Search Logic ---
    const searchInput = document.getElementById('search-input');
    const clearSearchButton = document.getElementById('clear-search-button');
    const suggestionsBox = document.getElementById('suggestions-box');

    const filterAlbums = (query) => {
        query = query.toLowerCase();
        albumCache.forEach(album => {
            const isVisible = album.title.includes(query);
            album.element.style.display = isVisible ? '' : 'none';
        });
    };

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        filterAlbums(query);
        clearSearchButton.classList.toggle('hidden', !query);
    });

    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        filterAlbums('');
        clearSearchButton.classList.add('hidden');
    });

    // --- Dedicated Lazy Loader for Detail View Images ---
    const lazyLoadDetailImages = () => {
        const detailImages = document.querySelectorAll('#detail-image-gallery .lazy-image');
        detailImages.forEach(img => {
            img.src = img.dataset.src;
            img.onload = () => {
                img.classList.add('loaded');
                const skeleton = img.previousElementSibling;
                if (skeleton && skeleton.classList.contains('skeleton-loader')) {
                    setTimeout(() => skeleton.remove(), 400);
                }
            };
        });
    };

    // --- Popup Menu & Settings Logic ---
    const menuButton = document.getElementById('menu-button');
    const closeMenuButton = document.getElementById('close-menu-button');
    const menuOverlay = document.getElementById('popup-menu-overlay');
    const popupMenuContainer = menuOverlay.querySelector('div');
    const popupMenu = document.getElementById('popup-menu');
    const settingsView = document.getElementById('settings-view');
    const settingsButton = document.getElementById('settings-button');
    const backToMenuButton = document.getElementById('back-to-menu-button');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const apiKeyInput = document.getElementById('api-key-input');
    const dbUrlInput = document.getElementById('db-url-input');
    const settingsError = document.getElementById('settings-error');

    const openMenu = () => {
        apiKeyInput.value = localStorage.getItem('API_KEY') || '';
        dbUrlInput.value = localStorage.getItem('DB_URL') || '';
        popupMenu.classList.remove('hidden');
        settingsView.classList.add('hidden');
        backToMenuButton.classList.remove('hidden');
        menuOverlay.classList.remove('pointer-events-none', 'opacity-0');
        popupMenuContainer.classList.add('scale-100');
        popupMenuContainer.classList.remove('scale-95');
        menuOverlay.addEventListener('click', closeMenuByBackdrop);
    };

    const closeMenu = () => {
        menuOverlay.classList.add('opacity-0');
        setTimeout(() => menuOverlay.classList.add('pointer-events-none'), 300);
        popupMenuContainer.classList.remove('scale-100');
        popupMenuContainer.classList.add('scale-95');
    };

    const closeMenuByBackdrop = (e) => {
        if (e.target === menuOverlay) closeMenu();
    };

    const showSettingsOnboarding = () => {
        popupMenu.classList.add('hidden');
        settingsView.classList.remove('hidden');
        backToMenuButton.classList.add('hidden');
        menuOverlay.classList.remove('pointer-events-none', 'opacity-0');
        popupMenuContainer.classList.add('scale-100');
        popupMenuContainer.classList.remove('scale-95');
        menuOverlay.removeEventListener('click', closeMenuByBackdrop);
    };

    settingsButton.addEventListener('click', (e) => {
        e.preventDefault();
        popupMenu.classList.add('hidden');
        settingsView.classList.remove('hidden');
    });

    backToMenuButton.addEventListener('click', () => {
        settingsView.classList.add('hidden');
        popupMenu.classList.remove('hidden');
    });

    /**
     * Validates credentials by checking for either a successful response 
     * or the specific "No sub field found" error, which implies successful authentication.
     */
    async function validateCredentials(key, url) {
        try {
            // Attempt the API call as before.
            await apiCall(key, url, '?metafields=count', 'GET');
            // If the call succeeds without an error (e.g., a 200 OK response), credentials are valid.
            return true;
        } catch (error) {
            // The API call failed. Now we check if it's our "successful failure".
            console.warn("Validation API call threw an error, checking if it's the expected one:", error.message);

            // If the error message contains this specific text, it means authentication passed.
            if (error.message && error.message.includes("No sub field found")) {
                console.log("Validation successful: Received expected 'No sub field found' error.");
                return true;
            }

            // If it's any other error (like 401 Unauthorized, network failure), it's a real failure.
            console.error("Credential validation failed with an unexpected error:", error);
            return false;
        }
    }

    saveSettingsButton.addEventListener('click', async () => {
        const newApiKey = apiKeyInput.value.trim();
        const newDbUrl = dbUrlInput.value.trim();
        settingsError.textContent = '';
        saveSettingsButton.disabled = true;
        saveSettingsButton.textContent = 'Validating...';

        if (!newApiKey || !newDbUrl) {
            settingsError.textContent = 'Both fields are required.';
            saveSettingsButton.disabled = false;
            saveSettingsButton.textContent = 'Save';
            return;
        }

        const areValid = await validateCredentials(newApiKey, newDbUrl);

        if (areValid) {
            localStorage.setItem('API_KEY', newApiKey);
            localStorage.setItem('DB_URL', newDbUrl);
            API_KEY = newApiKey;
            DB_URL = newDbUrl;

            saveSettingsButton.textContent = 'Saved!';
            setTimeout(() => {
                closeMenu();
                fetchAndDisplayAlbums();
                saveSettingsButton.disabled = false;
                saveSettingsButton.textContent = 'Save';
            }, 1000);
        } else {
            settingsError.textContent = 'Invalid credentials or network error.';
            saveSettingsButton.disabled = false;
            saveSettingsButton.textContent = 'Save';
        }
    });

    menuButton.addEventListener('click', openMenu);
    closeMenuButton.addEventListener('click', closeMenu);

    // --- Expandable Album Detail Logic ---
    const detailContainer = document.getElementById('album-detail-container');
    const detailBackdrop = document.getElementById('detail-backdrop');

    let currentlyOpenCard = null;

    const closeDetailView = () => {
        if (!currentlyOpenCard) return;
        detailContainer.classList.remove('expanded');
        detailBackdrop.classList.remove('expanded');
        currentlyOpenCard.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2', 'dark:ring-offset-gray-900');
        currentlyOpenCard = null;
    };

    function handleCardClick(card) {
        if (currentlyOpenCard === card) {
            closeDetailView();
            return;
        }
        if (currentlyOpenCard) {
            closeDetailView();
        }

        currentlyOpenCard = card;
        card.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2', 'dark:ring-offset-gray-900');

        const title = card.dataset.title;
        const description = card.dataset.description;
        const images = JSON.parse(card.dataset.images || '[]');

        document.getElementById('detail-title').title = title;
        document.getElementById('detail-title').textContent = title;
        document.getElementById('detail-description').textContent = description;
        document.getElementById('detail-image-count').textContent = `${images.length} Image${images.length !== 1 ? 's' : ''}`;

        const gallery = document.getElementById('detail-image-gallery');
        gallery.innerHTML = '';

        const imagesToShow = images.slice(0, 3);
        imagesToShow.forEach(src => {
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'relative w-full overflow-hidden rounded-lg';
            imageWrapper.innerHTML = `
                <div class="skeleton-loader absolute inset-0"></div>
                <img data-src="${src}" class="lazy-image w-full h-full object-cover">
            `;
            gallery.appendChild(imageWrapper);
        });

        const maxGridItems = 3;
        if (imagesToShow.length < maxGridItems) {
            for (let i = 0; i < maxGridItems - imagesToShow.length; i++) {
                const placeholderWrapper = document.createElement('div');
                placeholderWrapper.className = 'relative w-full overflow-hidden rounded-lg';
                placeholderWrapper.innerHTML = `<div class="placeholder-image"></div>`;
                gallery.appendChild(placeholderWrapper);
            }
        }

        lazyLoadDetailImages();

        detailContainer.classList.add('expanded');
        detailBackdrop.classList.add('expanded');
    }

    detailBackdrop.addEventListener('click', closeDetailView);
    menuButton.addEventListener('click', closeDetailView);

    // --- Initial Load ---
    if (!API_KEY || !DB_URL) {
        showSettingsOnboarding();
    } else {
        await fetchAndDisplayAlbums();
    }
});